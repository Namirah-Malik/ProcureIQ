import { db } from "./client";
import bcrypt from "bcryptjs";
import {
  organizations, users, suppliers, products,
  purchaseOrders, purchaseOrderLines,
  invoices, invoiceLines,
  goodsReceipts, goodsReceiptLines,
} from "./schema";
import { toMinor } from "@/lib/money";
import { runReconciliation } from "@/domain/reconciliation";

async function main() {
  console.log("Seeding ProcureIQ demo data...");

  const [org] = await db.insert(organizations).values({
    name: "Meridian Manufacturing Pvt Ltd",
    defaultCurrency: "INR",
    priceTolerancePct: 1.0,
    quantityToleranceUnits: 0,
  }).returning();

  // Demo password for every seeded user: "procureiq-demo". Change immediately in
  // any environment other people can reach — this is only for local trial use.
  const demoPasswordHash = await bcrypt.hash("procureiq-demo", 10);

  const [analyst] = await db.insert(users).values({
    orgId: org.id, name: "Asha Rao", email: "asha.rao@meridian.demo", passwordHash: demoPasswordHash, role: "analyst",
  }).returning();
  await db.insert(users).values([
    { orgId: org.id, name: "Vikram Shah", email: "vikram.shah@meridian.demo", passwordHash: demoPasswordHash, role: "manager" },
    { orgId: org.id, name: "Priya Nair", email: "priya.nair@meridian.demo", passwordHash: demoPasswordHash, role: "finance" },
  ]);

  const [supA, supB, supC] = await db.insert(suppliers).values([
    { orgId: org.id, code: "SUP-001", name: "Keystone Industrial Supplies", contactEmail: "accounts@keystone-industrial.demo" },
    { orgId: org.id, code: "SUP-002", name: "Orbit Components Ltd", contactEmail: "billing@orbitcomponents.demo" },
    { orgId: org.id, code: "SUP-003", name: "Havenlight Packaging Co", contactEmail: "ar@havenlight.demo" },
  ]).returning();

  const [bearing, steel, carton, resin] = await db.insert(products).values([
    { orgId: org.id, sku: "BRG-6204", description: "Ball bearing 6204-2RS", unitOfMeasure: "EA" },
    { orgId: org.id, sku: "STL-SHT-2MM", description: "Cold rolled steel sheet 2mm", unitOfMeasure: "SHEET" },
    { orgId: org.id, sku: "CTN-STD-01", description: "Standard shipping carton (L)", unitOfMeasure: "EA" },
    { orgId: org.id, sku: "RSN-EP-5L", description: "Epoxy resin 5L container", unitOfMeasure: "EA" },
  ]).returning();

  // --- Scenario 1: clean match (no exception) ---
  const [po1] = await db.insert(purchaseOrders).values({
    orgId: org.id, poNumber: "PO-10001", supplierId: supA.id,
    orderDate: "2026-09-02", expectedDeliveryDate: "2026-09-12", currency: "INR", status: "closed",
  }).returning();
  await db.insert(purchaseOrderLines).values({
    purchaseOrderId: po1.id, lineNumber: 1, productId: bearing.id,
    description: "Ball bearing 6204-2RS", quantity: 500, unitOfMeasure: "EA", unitPriceMinor: toMinor(45),
  });
  const [inv1] = await db.insert(invoices).values({
    orgId: org.id, invoiceNumber: "KEY-INV-5541", supplierId: supA.id, purchaseOrderId: po1.id,
    invoiceDate: "2026-09-13", currency: "INR", totalMinor: toMinor(500 * 45), taxMinor: toMinor(500*45*0.18),
  }).returning();
  await db.insert(invoiceLines).values({
    invoiceId: inv1.id, lineNumber: 1, productId: bearing.id, description: "Ball bearing 6204-2RS",
    quantity: 500, unitOfMeasure: "EA", unitPriceMinor: toMinor(45), lineTotalMinor: toMinor(500 * 45),
  });
  const [grn1] = await db.insert(goodsReceipts).values({
    orgId: org.id, grnNumber: "GRN-9001", purchaseOrderId: po1.id, receivedDate: "2026-09-12",
  }).returning();
  await db.insert(goodsReceiptLines).values({
    goodsReceiptId: grn1.id, lineNumber: 1, productId: bearing.id, description: "Ball bearing 6204-2RS",
    receivedQuantity: 500, unitOfMeasure: "EA",
  });

  // --- Scenario 2: price variance (invoice overcharges vs PO) + quantity variance (under-received) ---
  const [po2] = await db.insert(purchaseOrders).values({
    orgId: org.id, poNumber: "PO-10002", supplierId: supB.id,
    orderDate: "2026-09-05", expectedDeliveryDate: "2026-09-18", currency: "INR", status: "partially_received",
  }).returning();
  await db.insert(purchaseOrderLines).values({
    purchaseOrderId: po2.id, lineNumber: 1, productId: steel.id,
    description: "Cold rolled steel sheet 2mm", quantity: 100, unitOfMeasure: "SHEET", unitPriceMinor: toMinor(500),
  });
  const [inv2] = await db.insert(invoices).values({
    orgId: org.id, invoiceNumber: "ORB-INV-7788", supplierId: supB.id, purchaseOrderId: po2.id,
    invoiceDate: "2026-09-19", currency: "INR", totalMinor: toMinor(100 * 540),
  }).returning();
  await db.insert(invoiceLines).values({
    invoiceId: inv2.id, lineNumber: 1, productId: steel.id, description: "Cold rolled steel sheet 2mm",
    quantity: 100, unitOfMeasure: "SHEET", unitPriceMinor: toMinor(540), lineTotalMinor: toMinor(100 * 540),
  });
  const [grn2] = await db.insert(goodsReceipts).values({
    orgId: org.id, grnNumber: "GRN-9002", purchaseOrderId: po2.id, receivedDate: "2026-09-18",
  }).returning();
  await db.insert(goodsReceiptLines).values({
    goodsReceiptId: grn2.id, lineNumber: 1, productId: steel.id, description: "Cold rolled steel sheet 2mm",
    receivedQuantity: 90, unitOfMeasure: "SHEET",
  });

  // --- Scenario 3: duplicate invoice ---
  const [po3] = await db.insert(purchaseOrders).values({
    orgId: org.id, poNumber: "PO-10003", supplierId: supC.id,
    orderDate: "2026-09-08", expectedDeliveryDate: "2026-09-15", currency: "INR", status: "closed",
  }).returning();
  await db.insert(purchaseOrderLines).values({
    purchaseOrderId: po3.id, lineNumber: 1, productId: carton.id,
    description: "Standard shipping carton (L)", quantity: 2000, unitOfMeasure: "EA", unitPriceMinor: toMinor(18),
  });
  const [inv3a] = await db.insert(invoices).values({
    orgId: org.id, invoiceNumber: "HVN-2026-331", supplierId: supC.id, purchaseOrderId: po3.id,
    invoiceDate: "2026-09-16", currency: "INR", totalMinor: toMinor(2000 * 18),
  }).returning();
  await db.insert(invoiceLines).values({
    invoiceId: inv3a.id, lineNumber: 1, productId: carton.id, description: "Standard shipping carton (L)",
    quantity: 2000, unitOfMeasure: "EA", unitPriceMinor: toMinor(18), lineTotalMinor: toMinor(2000 * 18),
  });
  // duplicate submission of the same invoice number, same amount
  await db.insert(invoices).values({
    orgId: org.id, invoiceNumber: "HVN-2026-331", supplierId: supC.id, purchaseOrderId: po3.id,
    invoiceDate: "2026-09-16", currency: "INR", totalMinor: toMinor(2000 * 18),
  });
  const [grn3] = await db.insert(goodsReceipts).values({
    orgId: org.id, grnNumber: "GRN-9003", purchaseOrderId: po3.id, receivedDate: "2026-09-15",
  }).returning();
  await db.insert(goodsReceiptLines).values({
    goodsReceiptId: grn3.id, lineNumber: 1, productId: carton.id, description: "Standard shipping carton (L)",
    receivedQuantity: 2000, unitOfMeasure: "EA",
  });

  // --- Scenario 4: invoice with no matched PO (missing record) ---
  await db.insert(invoices).values({
    orgId: org.id, invoiceNumber: "KEY-INV-5599", supplierId: supA.id, purchaseOrderId: null,
    invoiceDate: "2026-09-20", currency: "INR", totalMinor: toMinor(12500),
  });
  await db.insert(purchaseOrderLines).values({
    purchaseOrderId: po1.id, lineNumber: 2, productId: resin.id,
    description: "Epoxy resin 5L container", quantity: 40, unitOfMeasure: "EA", unitPriceMinor: toMinor(1200),
  });

  console.log("Seed data inserted. Running reconciliation...");
  const result = await runReconciliation(org.id, analyst.id);
  console.log(`Reconciliation run ${result.runId}: ${result.documentsConsidered} docs considered, ${result.exceptionsCreated} exceptions created.`);
  console.log(`Demo org id: ${org.id}`);
  console.log(`Sign in with any seeded email above and password: procureiq-demo`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
