import { db } from "@/db/client";
import {
  purchaseOrders,
  purchaseOrderLines,
  invoices,
  invoiceLines,
  goodsReceipts,
  goodsReceiptLines,
  exceptionCases,
  reconciliationRuns,
  auditEvents,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type CalculationDetails = {
  expected: number | null; // minor units
  actual: number | null; // minor units
  variance: number | null; // minor units, actual - expected
  method: string;
  assumptions: string[];
  isEstimate: boolean;
};

function severityForExposure(exposureMinor: number, orgCriticalThresholdMinor = 5000000) {
  const abs = Math.abs(exposureMinor);
  if (abs >= orgCriticalThresholdMinor) return "critical" as const;
  if (abs >= orgCriticalThresholdMinor / 5) return "high" as const;
  if (abs >= orgCriticalThresholdMinor / 25) return "medium" as const;
  return "low" as const;
}

/**
 * Runs deterministic reconciliation for one organization:
 * - PO vs Invoice price variance
 * - Invoice vs GoodsReceipt quantity variance
 * - Duplicate invoice detection
 * - Missing counterpart detection
 *
 * Idempotent: exceptionCases.dedupeKey is unique per org, so re-running with
 * unchanged inputs will not create duplicate cases (insert is skipped on conflict).
 */
export async function runReconciliation(orgId: string, initiatedByUserId?: string) {
  const [run] = await db
    .insert(reconciliationRuns)
    .values({ orgId, initiatedByUserId, status: "running" })
    .returning();

  let documentsConsidered = 0;
  let exceptionsCreated = 0;
  const createdCaseIds: string[] = [];

  try {
    const orgInvoices = await db.select().from(invoices).where(eq(invoices.orgId, orgId));
    const orgPOs = await db.select().from(purchaseOrders).where(eq(purchaseOrders.orgId, orgId));

    // --- Duplicate invoice detection (exact key: supplier + invoice number + amount) ---
    const seen = new Map<string, (typeof orgInvoices)[number]>();
    for (const inv of orgInvoices) {
      documentsConsidered++;
      const key = `${inv.supplierId}::${inv.invoiceNumber.trim().toLowerCase()}`;
      const prior = seen.get(key);
      if (prior && prior.id !== inv.id) {
        const exact = prior.totalMinor === inv.totalMinor;
        const exposure = inv.totalMinor;
        const severity = exact ? "high" : "medium";
        const caseId = await upsertException(orgId, run.id, {
          dedupeKey: `dup:${orgId}:${key}:${inv.id}`,
          type: "duplicate_invoice",
          title: `Possible duplicate invoice ${inv.invoiceNumber} (supplier)`,
          supplierId: inv.supplierId,
          invoiceId: inv.id,
          severity,
          potentialExposureMinor: exposure,
          exposureCurrency: inv.currency,
          calculationDetailsJson: {
            expected: 1,
            actual: 2,
            variance: 1,
            method: exact
              ? "Exact match on supplier + invoice number + total amount"
              : "Same supplier + invoice number, amounts differ — flagged as likely duplicate, not confirmed",
            assumptions: [
              `Compared invoice ${prior.id} and ${inv.id}`,
              exact ? "Amounts match exactly" : "Amounts differ — requires manual confirmation",
            ],
            isEstimate: !exact,
          },
        });
        if (caseId) {
          exceptionsCreated++;
          createdCaseIds.push(caseId);
        }
      } else {
        seen.set(key, inv);
      }
    }

    // --- PO vs Invoice price variance, and missing-PO detection ---
    for (const inv of orgInvoices) {
      if (!inv.purchaseOrderId) {
        const caseId = await upsertException(orgId, run.id, {
          dedupeKey: `missing-po:${orgId}:${inv.id}`,
          type: "missing_record",
          title: `Invoice ${inv.invoiceNumber} has no matched purchase order`,
          supplierId: inv.supplierId,
          invoiceId: inv.id,
          severity: "medium",
          potentialExposureMinor: inv.totalMinor,
          exposureCurrency: inv.currency,
          calculationDetailsJson: {
            expected: null,
            actual: inv.totalMinor,
            variance: null,
            method: "No purchase order reference found or matched for this invoice",
            assumptions: ["Could be: PO not imported, PO number mismatch, or invoice raised without a PO"],
            isEstimate: true,
          },
        });
        if (caseId) { exceptionsCreated++; createdCaseIds.push(caseId); }
        continue;
      }

      const poLines = await db
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, inv.purchaseOrderId));
      const invLines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));

      const po = orgPOs.find((p) => p.id === inv.purchaseOrderId);
      if (!po) continue;
      const tolerancePct = 1.0; // organization default; see OrganizationSettings in full schema

      for (const invLine of invLines) {
        const matchedPoLine = poLines.find(
          (pl) => pl.productId && invLine.productId && pl.productId === invLine.productId
        ) ?? poLines.find((pl) => pl.description.trim().toLowerCase() === invLine.description.trim().toLowerCase());

        if (!matchedPoLine) continue;

        const expectedUnitPrice = matchedPoLine.unitPriceMinor;
        const actualUnitPrice = invLine.unitPriceMinor;
        const diff = actualUnitPrice - expectedUnitPrice;
        const pctDiff = expectedUnitPrice === 0 ? 0 : (Math.abs(diff) / expectedUnitPrice) * 100;

        if (pctDiff > tolerancePct) {
          const exposure = diff * invLine.quantity; // price variance applied to invoiced qty
          const caseId = await upsertException(orgId, run.id, {
            dedupeKey: `price:${orgId}:${inv.id}:${invLine.id}`,
            type: "price_variance",
            title: `Unit price variance on ${invLine.description} (Invoice ${inv.invoiceNumber})`,
            supplierId: inv.supplierId,
            purchaseOrderId: po.id,
            invoiceId: inv.id,
            severity: severityForExposure(exposure),
            potentialExposureMinor: Math.round(exposure),
            exposureCurrency: inv.currency,
            calculationDetailsJson: {
              expected: expectedUnitPrice,
              actual: actualUnitPrice,
              variance: diff,
              method: `(invoiced unit price - PO unit price) x invoiced quantity (${invLine.quantity}). Tolerance: ${tolerancePct}%`,
              assumptions: [
                "Excludes tax, freight, and discount adjustments",
                "Matched by product ID where available, otherwise normalized description",
              ],
              isEstimate: true,
            },
          });
          if (caseId) { exceptionsCreated++; createdCaseIds.push(caseId); }
        }
      }
    }

    // --- Invoice vs GoodsReceipt quantity variance ---
    for (const inv of orgInvoices) {
      if (!inv.purchaseOrderId) continue;
      const grns = await db
        .select()
        .from(goodsReceipts)
        .where(eq(goodsReceipts.purchaseOrderId, inv.purchaseOrderId));
      if (grns.length === 0) {
        const caseId = await upsertException(orgId, run.id, {
          dedupeKey: `missing-grn:${orgId}:${inv.id}`,
          type: "missing_record",
          title: `No goods-received record found for invoice ${inv.invoiceNumber}`,
          supplierId: inv.supplierId,
          purchaseOrderId: inv.purchaseOrderId,
          invoiceId: inv.id,
          severity: "medium",
          potentialExposureMinor: inv.totalMinor,
          exposureCurrency: inv.currency,
          calculationDetailsJson: {
            expected: null,
            actual: null,
            variance: null,
            method: "No GRN linked to this invoice's purchase order",
            assumptions: ["Goods may not have been received yet, or the GRN was not imported"],
            isEstimate: true,
          },
        });
        if (caseId) { exceptionsCreated++; createdCaseIds.push(caseId); }
        continue;
      }

      const invLines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
      let allReceiptLines: (typeof goodsReceiptLines.$inferSelect)[] = [];
      for (const grn of grns) {
        const lines = await db
          .select()
          .from(goodsReceiptLines)
          .where(eq(goodsReceiptLines.goodsReceiptId, grn.id));
        allReceiptLines = allReceiptLines.concat(lines);
      }

      for (const invLine of invLines) {
        const matchingReceiptQty = allReceiptLines
          .filter((rl) => (rl.productId && invLine.productId && rl.productId === invLine.productId) ||
            rl.description.trim().toLowerCase() === invLine.description.trim().toLowerCase())
          .reduce((sum, rl) => sum + rl.receivedQuantity, 0);

        const qtyVariance = invLine.quantity - matchingReceiptQty;
        const quantityToleranceUnits = 0;

        if (Math.abs(qtyVariance) > quantityToleranceUnits) {
          const exposure = qtyVariance * invLine.unitPriceMinor;
          const caseId = await upsertException(orgId, run.id, {
            dedupeKey: `qty:${orgId}:${inv.id}:${invLine.id}`,
            type: "quantity_variance",
            title: `Quantity variance on ${invLine.description} (Invoice ${inv.invoiceNumber})`,
            supplierId: inv.supplierId,
            purchaseOrderId: inv.purchaseOrderId,
            invoiceId: inv.id,
            goodsReceiptId: grns[0]?.id,
            severity: severityForExposure(exposure),
            potentialExposureMinor: Math.round(Math.abs(exposure)),
            exposureCurrency: inv.currency,
            calculationDetailsJson: {
              expected: matchingReceiptQty,
              actual: invLine.quantity,
              variance: qtyVariance,
              method: "invoiced quantity - total received quantity (across all matched GRNs), x unit price",
              assumptions: [
                qtyVariance > 0
                  ? "Invoice bills for more units than were recorded as received"
                  : "More units were received than invoiced (check for a missing invoice or credit)",
              ],
              isEstimate: true,
            },
          });
          if (caseId) { exceptionsCreated++; createdCaseIds.push(caseId); }
        }
      }
    }

    await db
      .update(reconciliationRuns)
      .set({
        status: "complete",
        completedAt: new Date(),
        documentsConsidered,
        exceptionsDetected: exceptionsCreated,
      })
      .where(eq(reconciliationRuns.id, run.id));

    await db.insert(auditEvents).values({
      orgId,
      actorUserId: initiatedByUserId,
      action: "reconciliation_run_completed",
      entityType: "reconciliation_run",
      entityId: run.id,
      metadataJson: JSON.stringify({ documentsConsidered, exceptionsCreated }),
    });

    return { runId: run.id, documentsConsidered, exceptionsCreated, caseIds: createdCaseIds };
  } catch (err) {
    await db
      .update(reconciliationRuns)
      .set({ status: "failed", completedAt: new Date(), errorSummary: String(err) })
      .where(eq(reconciliationRuns.id, run.id));
    throw err;
  }
}

async function upsertException(
  orgId: string,
  runId: string,
  data: {
    dedupeKey: string;
    type: typeof exceptionCases.$inferInsert["type"];
    title: string;
    supplierId?: string | null;
    purchaseOrderId?: string | null;
    invoiceId?: string | null;
    goodsReceiptId?: string | null;
    severity: "low" | "medium" | "high" | "critical";
    potentialExposureMinor: number;
    exposureCurrency: string;
    calculationDetailsJson: CalculationDetails;
  }
): Promise<string | null> {
  const existing = await db
    .select()
    .from(exceptionCases)
    .where(and(eq(exceptionCases.orgId, orgId), eq(exceptionCases.dedupeKey, data.dedupeKey)));
  if (existing.length > 0) return null; // idempotent: already exists, skip

  const [created] = await db
    .insert(exceptionCases)
    .values({
      orgId,
      reconciliationRunId: runId,
      dedupeKey: data.dedupeKey,
      type: data.type,
      title: data.title,
      supplierId: data.supplierId ?? null,
      purchaseOrderId: data.purchaseOrderId ?? null,
      invoiceId: data.invoiceId ?? null,
      goodsReceiptId: data.goodsReceiptId ?? null,
      severity: data.severity,
      status: "open",
      potentialExposureMinor: data.potentialExposureMinor,
      exposureCurrency: data.exposureCurrency,
      exposureIsEstimate: data.calculationDetailsJson.isEstimate,
      calculationDetailsJson: JSON.stringify(data.calculationDetailsJson),
    })
    .returning();

  await db.insert(auditEvents).values({
    orgId,
    action: "exception_created",
    entityType: "exception_case",
    entityId: created.id,
    metadataJson: JSON.stringify({ type: data.type, severity: data.severity }),
  });

  return created.id;
}
