import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const TEST_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "procureiq-import-test-"));
process.env.PGLITE_DATA_DIR = TEST_DB_DIR;
delete process.env.DATABASE_URL;

execSync(`npx drizzle-kit push --force`, {
  cwd: path.resolve(__dirname, "../.."),
  env: { ...process.env, PGLITE_DATA_DIR: TEST_DB_DIR },
  stdio: "pipe",
});

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { importDocument } = await import("./import");

describe("importDocument", () => {
  afterAll(() => {
    try { fs.rmSync(TEST_DB_DIR, { recursive: true, force: true }); } catch {}
  });

  it("imports a valid purchase order CSV and creates the PO + lines", async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Import Test Org" }).returning();
    const csv = [
      "po_number,supplier_code,order_date,expected_delivery_date,currency,line_number,sku,description,quantity,unit_of_measure,unit_price",
      "PO-TEST-1,SUP-X,2026-01-01,2026-01-10,INR,1,SKU-A,Widget A,10,EA,25",
    ].join("\n");

    const result = await importDocument(org.id, "purchase_order", "po.csv", "text/csv", Buffer.from(csv));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recordsCreated).toBe(1);
    }

    const pos = await db.select().from(schema.purchaseOrders);
    expect(pos.find((p) => p.poNumber === "PO-TEST-1")).toBeDefined();
  });

  it("rejects an oversized file", async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Oversize Org" }).returning();
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024, "a"); // 11MB > 10MB limit
    const result = await importDocument(org.id, "purchase_order", "big.csv", "text/csv", bigBuffer);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exceeds/i);
  });

  it("rejects an unsupported file extension", async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Ext Org" }).returning();
    const result = await importDocument(org.id, "purchase_order", "malware.exe", "application/octet-stream", Buffer.from("hello"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unsupported file type/i);
  });

  it("rejects a path-traversal file name", async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Path Org" }).returning();
    const result = await importDocument(org.id, "purchase_order", "../../etc/passwd.csv", "text/csv", Buffer.from("a,b\n1,2"));
    expect(result.ok).toBe(false);
  });

  it("flags rows that fail schema validation instead of silently dropping the whole file", async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Partial Org" }).returning();
    const csv = [
      "po_number,supplier_code,order_date,line_number,description,quantity,unit_price",
      "PO-GOOD,SUP-X,2026-01-01,1,Good row,5,10",
      "PO-BAD,SUP-X,2026-01-01,1,Bad row,not_a_number,10", // invalid quantity
    ].join("\n");
    const result = await importDocument(org.id, "purchase_order", "mixed.csv", "text/csv", Buffer.from(csv));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recordsCreated).toBe(1); // only the good row's PO created
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("does not create a duplicate PO when the same PO number is imported twice", async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Dup PO Org" }).returning();
    const csv = [
      "po_number,supplier_code,order_date,line_number,description,quantity,unit_price",
      "PO-DUPE,SUP-X,2026-01-01,1,Widget,5,10",
    ].join("\n");
    await importDocument(org.id, "purchase_order", "a.csv", "text/csv", Buffer.from(csv));
    const second = await importDocument(org.id, "purchase_order", "b.csv", "text/csv", Buffer.from(csv));

    const pos = (await db.select().from(schema.purchaseOrders)).filter((p) => p.poNumber === "PO-DUPE" && p.orgId === org.id);
    expect(pos.length).toBe(1);
    if (second.ok) expect(second.warnings.some((w) => w.includes("already exists"))).toBe(true);
  });
});
