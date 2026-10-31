import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// Each test run gets its own throwaway PGlite (real Postgres engine, WASM) data
// directory so tests never touch the dev/demo database and can run in parallel
// with other suites.
const TEST_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "procureiq-recon-test-"));
process.env.PGLITE_DATA_DIR = TEST_DB_DIR;
delete process.env.DATABASE_URL; // make sure we never accidentally hit a real Postgres in tests

execSync(`npx drizzle-kit push --force`, {
  cwd: path.resolve(__dirname, "../.."),
  env: { ...process.env, PGLITE_DATA_DIR: TEST_DB_DIR },
  stdio: "pipe",
});

// Imported AFTER PGLITE_DATA_DIR is set so the client binds to the test DB.
const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { toMinor } = await import("@/lib/money");
const { runReconciliation } = await import("./reconciliation");

async function seedBasicOrg() {
  const [org] = await db.insert(schema.organizations).values({ name: "Test Org" }).returning();
  const [supplier] = await db.insert(schema.suppliers).values({ orgId: org.id, code: "S1", name: "Test Supplier" }).returning();
  const [product] = await db.insert(schema.products).values({ orgId: org.id, sku: "SKU-1", description: "Widget" }).returning();
  return { org, supplier, product };
}

describe("runReconciliation", () => {
  afterAll(() => {
    try { fs.rmSync(TEST_DB_DIR, { recursive: true, force: true }); } catch {}
  });

  it("detects a price variance beyond tolerance", async () => {
    const { org, supplier, product } = await seedBasicOrg();
    const [po] = await db.insert(schema.purchaseOrders).values({
      orgId: org.id, poNumber: "PO-1", supplierId: supplier.id, orderDate: "2026-01-01", currency: "INR",
    }).returning();
    await db.insert(schema.purchaseOrderLines).values({
      purchaseOrderId: po.id, lineNumber: 1, productId: product.id, description: "Widget",
      quantity: 10, unitPriceMinor: toMinor(100),
    });
    const [inv] = await db.insert(schema.invoices).values({
      orgId: org.id, invoiceNumber: "INV-1", supplierId: supplier.id, purchaseOrderId: po.id,
      invoiceDate: "2026-01-05", currency: "INR", totalMinor: toMinor(1200),
    }).returning();
    await db.insert(schema.invoiceLines).values({
      invoiceId: inv.id, lineNumber: 1, productId: product.id, description: "Widget",
      quantity: 10, unitPriceMinor: toMinor(120), lineTotalMinor: toMinor(1200),
    });

    const result = await runReconciliation(org.id);
    const cases = await db.select().from(schema.exceptionCases);
    const priceCase = cases.find((c) => c.type === "price_variance");

    expect(priceCase).toBeDefined();
    expect(priceCase!.potentialExposureMinor).toBe(toMinor(20) * 10); // (120-100) x 10 units
    expect(result.exceptionsCreated).toBeGreaterThanOrEqual(1);
  });

  it("does not flag a price within tolerance", async () => {
    const { org, supplier, product } = await seedBasicOrg();
    const [po] = await db.insert(schema.purchaseOrders).values({
      orgId: org.id, poNumber: "PO-2", supplierId: supplier.id, orderDate: "2026-01-01", currency: "INR",
    }).returning();
    await db.insert(schema.purchaseOrderLines).values({
      purchaseOrderId: po.id, lineNumber: 1, productId: product.id, description: "Widget",
      quantity: 10, unitPriceMinor: toMinor(100),
    });
    const [inv] = await db.insert(schema.invoices).values({
      orgId: org.id, invoiceNumber: "INV-2", supplierId: supplier.id, purchaseOrderId: po.id,
      invoiceDate: "2026-01-05", currency: "INR", totalMinor: toMinor(1000.5),
    }).returning();
    await db.insert(schema.invoiceLines).values({
      invoiceId: inv.id, lineNumber: 1, productId: product.id, description: "Widget",
      quantity: 10, unitPriceMinor: toMinor(100.05), lineTotalMinor: toMinor(1000.5), // 0.05% over, within 1% tolerance
    });

    await runReconciliation(org.id);
    const priceCases = (await db.select().from(schema.exceptionCases)).filter((c) => c.invoiceId === inv.id && c.type === "price_variance");
    expect(priceCases.length).toBe(0);
  });

  it("detects a quantity variance against goods received", async () => {
    const { org, supplier, product } = await seedBasicOrg();
    const [po] = await db.insert(schema.purchaseOrders).values({
      orgId: org.id, poNumber: "PO-3", supplierId: supplier.id, orderDate: "2026-01-01", currency: "INR",
    }).returning();
    const [inv] = await db.insert(schema.invoices).values({
      orgId: org.id, invoiceNumber: "INV-3", supplierId: supplier.id, purchaseOrderId: po.id,
      invoiceDate: "2026-01-05", currency: "INR", totalMinor: toMinor(1000),
    }).returning();
    await db.insert(schema.invoiceLines).values({
      invoiceId: inv.id, lineNumber: 1, productId: product.id, description: "Widget",
      quantity: 100, unitPriceMinor: toMinor(10), lineTotalMinor: toMinor(1000),
    });
    const [grn] = await db.insert(schema.goodsReceipts).values({
      orgId: org.id, grnNumber: "GRN-3", purchaseOrderId: po.id, receivedDate: "2026-01-04",
    }).returning();
    await db.insert(schema.goodsReceiptLines).values({
      goodsReceiptId: grn.id, lineNumber: 1, productId: product.id, description: "Widget", receivedQuantity: 90,
    });

    await runReconciliation(org.id);
    const cases = (await db.select().from(schema.exceptionCases)).filter((c) => c.invoiceId === inv.id && c.type === "quantity_variance");
    expect(cases.length).toBe(1);
    const details = JSON.parse(cases[0].calculationDetailsJson);
    expect(details.variance).toBe(10); // invoiced 100 - received 90
  });

  it("detects an exact duplicate invoice", async () => {
    const { org, supplier } = await seedBasicOrg();
    await db.insert(schema.invoices).values({
      orgId: org.id, invoiceNumber: "DUP-1", supplierId: supplier.id, invoiceDate: "2026-01-01", currency: "INR", totalMinor: toMinor(500),
    });
    await db.insert(schema.invoices).values({
      orgId: org.id, invoiceNumber: "DUP-1", supplierId: supplier.id, invoiceDate: "2026-01-01", currency: "INR", totalMinor: toMinor(500),
    });

    await runReconciliation(org.id);
    const dupCases = (await db.select().from(schema.exceptionCases)).filter((c) => c.orgId === org.id && c.type === "duplicate_invoice");
    expect(dupCases.length).toBe(1);
    expect(dupCases[0].severity).toBe("high"); // exact amount match
  });

  it("flags an invoice with no matching purchase order as a missing record", async () => {
    const { org, supplier } = await seedBasicOrg();
    await db.insert(schema.invoices).values({
      orgId: org.id, invoiceNumber: "ORPHAN-1", supplierId: supplier.id, purchaseOrderId: null,
      invoiceDate: "2026-01-01", currency: "INR", totalMinor: toMinor(250),
    });

    await runReconciliation(org.id);
    const missing = (await db.select().from(schema.exceptionCases)).filter((c) => c.orgId === org.id && c.type === "missing_record");
    expect(missing.length).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent: running twice on unchanged data does not duplicate exceptions", async () => {
    const { org, supplier, product } = await seedBasicOrg();
    const [po] = await db.insert(schema.purchaseOrders).values({
      orgId: org.id, poNumber: "PO-IDEMPOTENT", supplierId: supplier.id, orderDate: "2026-01-01", currency: "INR",
    }).returning();
    await db.insert(schema.purchaseOrderLines).values({
      purchaseOrderId: po.id, lineNumber: 1, productId: product.id, description: "Widget", quantity: 5, unitPriceMinor: toMinor(50),
    });
    const [inv] = await db.insert(schema.invoices).values({
      orgId: org.id, invoiceNumber: "INV-IDEMPOTENT", supplierId: supplier.id, purchaseOrderId: po.id,
      invoiceDate: "2026-01-05", currency: "INR", totalMinor: toMinor(400),
    }).returning();
    await db.insert(schema.invoiceLines).values({
      invoiceId: inv.id, lineNumber: 1, productId: product.id, description: "Widget", quantity: 5, unitPriceMinor: toMinor(80), lineTotalMinor: toMinor(400),
    });
    const [grn] = await db.insert(schema.goodsReceipts).values({
      orgId: org.id, grnNumber: "GRN-IDEMPOTENT", purchaseOrderId: po.id, receivedDate: "2026-01-04",
    }).returning();
    await db.insert(schema.goodsReceiptLines).values({
      goodsReceiptId: grn.id, lineNumber: 1, productId: product.id, description: "Widget", receivedQuantity: 5,
    });

    const first = await runReconciliation(org.id);
    const second = await runReconciliation(org.id);

    const allCasesForInvoice = (await db.select().from(schema.exceptionCases)).filter((c) => c.invoiceId === inv.id);
    expect(allCasesForInvoice.length).toBe(1); // not duplicated on second run
    expect(second.exceptionsCreated).toBe(0); // nothing NEW created the second time
    expect(first.exceptionsCreated).toBeGreaterThan(0);
  });
});
