import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { db } from "@/db/client";
import {
  procurementDocuments, suppliers, products,
  purchaseOrders, purchaseOrderLines,
  invoices, invoiceLines,
  goodsReceipts, goodsReceiptLines,
  auditEvents,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { toMinor } from "@/lib/money";

export type DocType = "purchase_order" | "invoice" | "goods_receipt";

export type ImportResult =
  | { ok: true; documentId: string; recordsCreated: number; warnings: string[] }
  | { ok: false; documentId: string | null; error: string; warnings: string[] };

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

// --- Row schemas (one row per document line; rows sharing header fields are grouped) ---

const poRowSchema = z.object({
  po_number: z.string().min(1),
  supplier_code: z.string().min(1),
  order_date: z.string().min(1),
  expected_delivery_date: z.string().optional().default(""),
  currency: z.string().optional().default("INR"),
  line_number: z.coerce.number().int().positive(),
  sku: z.string().optional().default(""),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_of_measure: z.string().optional().default("EA"),
  unit_price: z.coerce.number().nonnegative(),
});

const invoiceRowSchema = z.object({
  invoice_number: z.string().min(1),
  supplier_code: z.string().min(1),
  po_number: z.string().optional().default(""),
  invoice_date: z.string().min(1),
  currency: z.string().optional().default("INR"),
  tax: z.coerce.number().optional().default(0),
  freight: z.coerce.number().optional().default(0),
  discount: z.coerce.number().optional().default(0),
  line_number: z.coerce.number().int().positive(),
  sku: z.string().optional().default(""),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_of_measure: z.string().optional().default("EA"),
  unit_price: z.coerce.number().nonnegative(),
});

const grnRowSchema = z.object({
  grn_number: z.string().min(1),
  po_number: z.string().min(1),
  received_date: z.string().min(1),
  line_number: z.coerce.number().int().positive(),
  sku: z.string().optional().default(""),
  description: z.string().min(1),
  received_quantity: z.coerce.number().positive(),
  unit_of_measure: z.string().optional().default("EA"),
});

function parseTabularFile(buffer: Buffer, fileName: string): Record<string, unknown>[] {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (ext === ".csv") {
    const text = buffer.toString("utf-8");
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replaceAll(" ", "_") });
    if (result.errors.length > 0) {
      throw new Error(`CSV parse error: ${result.errors[0].message} (row ${result.errors[0].row})`);
    }
    return result.data as Record<string, unknown>[];
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
    return rows.map((r) => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) normalized[k.trim().toLowerCase().replaceAll(" ", "_")] = v;
      return normalized;
    });
  }
  throw new Error(`Unsupported file extension: ${ext}`);
}

export async function importDocument(
  orgId: string,
  type: DocType,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<ImportResult> {
  const warnings: string[] = [];

  // --- Stage: format & security validation ---
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return { ok: false, documentId: null, error: "File exceeds the 10MB upload limit", warnings };
  }
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, documentId: null, error: `Unsupported file type ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`, warnings };
  }
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return { ok: false, documentId: null, error: "Invalid file name", warnings };
  }

  const [doc] = await db
    .insert(procurementDocuments)
    .values({
      orgId, type, fileName, mimeType, sizeBytes: buffer.byteLength,
      extractionStatus: "processing", validationStatus: "unvalidated", reconciliationStatus: "not_eligible",
    })
    .returning();

  try {
    // --- Stage: extraction ---
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = parseTabularFile(buffer, fileName);
    } catch (err) {
      await markFailed(doc.id, `Extraction failed: ${String(err instanceof Error ? err.message : err)}`);
      return { ok: false, documentId: doc.id, error: "Could not parse file contents", warnings };
    }
    if (rawRows.length === 0) {
      await markFailed(doc.id, "File contained no data rows");
      return { ok: false, documentId: doc.id, error: "File contained no data rows", warnings };
    }
    await db.update(procurementDocuments).set({ rawExtractedJson: JSON.stringify(rawRows).slice(0, 100000) }).where(eq(procurementDocuments.id, doc.id));

    // --- Stage: schema validation + normalization ---
    const schema = type === "purchase_order" ? poRowSchema : type === "invoice" ? invoiceRowSchema : grnRowSchema;
    const validRows: any[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const parsed = schema.safeParse(rawRows[i]);
      if (!parsed.success) {
        warnings.push(`Row ${i + 2}: ${parsed.error.issues.map((e) => `${e.path.join(".")} ${e.message}`).join("; ")}`);
        continue;
      }
      validRows.push(parsed.data);
    }
    if (validRows.length === 0) {
      await markFailed(doc.id, "No rows passed schema validation");
      return { ok: false, documentId: doc.id, error: "No rows passed schema validation", warnings };
    }

    // --- Stage: persistence (type-specific) ---
    let recordsCreated = 0;
    if (type === "purchase_order") recordsCreated = await persistPurchaseOrders(orgId, doc.id, validRows, warnings);
    else if (type === "invoice") recordsCreated = await persistInvoices(orgId, doc.id, validRows, warnings);
    else recordsCreated = await persistGoodsReceipts(orgId, doc.id, validRows, warnings);

    await db
      .update(procurementDocuments)
      .set({
        extractionStatus: "complete",
        validationStatus: warnings.length > 0 ? "has_errors" : "validated",
        reconciliationStatus: "eligible",
        updatedAt: new Date(),
      })
      .where(eq(procurementDocuments.id, doc.id));

    await db.insert(auditEvents).values({
      orgId, action: "document_imported", entityType: "procurement_document", entityId: doc.id,
      metadataJson: JSON.stringify({ type, fileName, recordsCreated, warningCount: warnings.length }),
    });

    return { ok: true, documentId: doc.id, recordsCreated, warnings };
  } catch (err) {
    await markFailed(doc.id, String(err instanceof Error ? err.message : err));
    return { ok: false, documentId: doc.id, error: "Unexpected error during import", warnings };
  }
}

async function markFailed(documentId: string, error: string) {
  await db.update(procurementDocuments).set({ extractionStatus: "failed", processingError: error }).where(eq(procurementDocuments.id, documentId));
}

async function findOrCreateSupplier(orgId: string, code: string) {
  const [existing] = await db.select().from(suppliers).where(and(eq(suppliers.orgId, orgId), eq(suppliers.code, code)));
  if (existing) return existing;
  const [created] = await db.insert(suppliers).values({ orgId, code, name: code }).returning();
  return created;
}

async function findOrCreateProduct(orgId: string, sku: string, description: string, unitOfMeasure: string) {
  if (!sku) return null;
  const [existing] = await db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.sku, sku)));
  if (existing) return existing;
  const [created] = await db.insert(products).values({ orgId, sku, description, unitOfMeasure }).returning();
  return created;
}

async function persistPurchaseOrders(orgId: string, documentId: string, rows: z.infer<typeof poRowSchema>[], warnings: string[]) {
  const groups = groupBy(rows, (r) => r.po_number);
  let created = 0;
  for (const [poNumber, lines] of groups) {
    const existing = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.poNumber, poNumber)));
    if (existing.length > 0) {
      warnings.push(`PO ${poNumber} already exists — skipped to avoid duplicate import`);
      continue;
    }
    const head = lines[0];
    const supplier = await findOrCreateSupplier(orgId, head.supplier_code);
    const [po] = await db.insert(purchaseOrders).values({
      orgId, documentId, poNumber, supplierId: supplier.id,
      orderDate: head.order_date, expectedDeliveryDate: head.expected_delivery_date || null, currency: head.currency,
    }).returning();
    for (const line of lines) {
      const product = await findOrCreateProduct(orgId, line.sku, line.description, line.unit_of_measure);
      await db.insert(purchaseOrderLines).values({
        purchaseOrderId: po.id, lineNumber: line.line_number, productId: product?.id ?? null,
        description: line.description, quantity: line.quantity, unitOfMeasure: line.unit_of_measure,
        unitPriceMinor: toMinor(line.unit_price),
      });
    }
    created++;
  }
  return created;
}

async function persistInvoices(orgId: string, documentId: string, rows: z.infer<typeof invoiceRowSchema>[], warnings: string[]) {
  const groups = groupBy(rows, (r) => r.invoice_number);
  let created = 0;
  for (const [invoiceNumber, lines] of groups) {
    const head = lines[0];
    const supplier = await findOrCreateSupplier(orgId, head.supplier_code);
    let purchaseOrderId: string | null = null;
    if (head.po_number) {
      const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.poNumber, head.po_number)));
      if (po) purchaseOrderId = po.id;
      else warnings.push(`Invoice ${invoiceNumber}: referenced PO ${head.po_number} not found`);
    }
    const lineTotal = lines.reduce((sum, l) => sum + toMinor(l.unit_price) * l.quantity, 0);
    const totalMinor = Math.round(lineTotal + toMinor(head.tax) + toMinor(head.freight) - toMinor(head.discount));
    const [inv] = await db.insert(invoices).values({
      orgId, documentId, invoiceNumber, supplierId: supplier.id, purchaseOrderId,
      invoiceDate: head.invoice_date, currency: head.currency,
      taxMinor: toMinor(head.tax), freightMinor: toMinor(head.freight), discountMinor: toMinor(head.discount),
      totalMinor,
    }).returning();
    for (const line of lines) {
      const product = await findOrCreateProduct(orgId, line.sku, line.description, line.unit_of_measure);
      await db.insert(invoiceLines).values({
        invoiceId: inv.id, lineNumber: line.line_number, productId: product?.id ?? null,
        description: line.description, quantity: line.quantity, unitOfMeasure: line.unit_of_measure,
        unitPriceMinor: toMinor(line.unit_price), lineTotalMinor: Math.round(toMinor(line.unit_price) * line.quantity),
      });
    }
    created++;
  }
  return created;
}

async function persistGoodsReceipts(orgId: string, documentId: string, rows: z.infer<typeof grnRowSchema>[], warnings: string[]) {
  const groups = groupBy(rows, (r) => r.grn_number);
  let created = 0;
  for (const [grnNumber, lines] of groups) {
    const head = lines[0];
    const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.poNumber, head.po_number)));
    if (!po) {
      warnings.push(`GRN ${grnNumber}: referenced PO ${head.po_number} not found — imported without PO link`);
    }
    const [grn] = await db.insert(goodsReceipts).values({
      orgId, documentId, grnNumber, purchaseOrderId: po?.id ?? null, receivedDate: head.received_date,
    }).returning();
    for (const line of lines) {
      const product = await findOrCreateProduct(orgId, line.sku, line.description, line.unit_of_measure);
      await db.insert(goodsReceiptLines).values({
        goodsReceiptId: grn.id, lineNumber: line.line_number, productId: product?.id ?? null,
        description: line.description, receivedQuantity: line.received_quantity, unitOfMeasure: line.unit_of_measure,
      });
    }
    created++;
  }
  return created;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}
