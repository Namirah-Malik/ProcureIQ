import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { exceptionCases, suppliers, purchaseOrders, invoices, supplierCommunications, auditEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { draftSupplierEmail } from "@/domain/ai-email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No organization context" }, { status: 401 });

  const [exc] = await db.select().from(exceptionCases).where(eq(exceptionCases.id, id));
  if (!exc || exc.orgId !== session.org.id) return NextResponse.json({ error: "Exception not found" }, { status: 404 });

  const supplier = exc.supplierId ? (await db.select().from(suppliers).where(eq(suppliers.id, exc.supplierId)))[0] : null;
  const po = exc.purchaseOrderId ? (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, exc.purchaseOrderId)))[0] : null;
  const inv = exc.invoiceId ? (await db.select().from(invoices).where(eq(invoices.id, exc.invoiceId)))[0] : null;
  const calc = JSON.parse(exc.calculationDetailsJson);

  const result = await draftSupplierEmail({
    supplierName: supplier?.name ?? "Supplier",
    invoiceNumber: inv?.invoiceNumber,
    purchaseOrderNumber: po?.poNumber,
    exceptionTitle: exc.title,
    exceptionType: exc.type,
    calculationSummary: `${calc.method}. Expected: ${calc.expected}, Actual: ${calc.actual}, Variance: ${calc.variance}.`,
    currency: exc.exposureCurrency,
  });

  await db.insert(auditEvents).values({
    orgId: session.org.id, actorUserId: session.user?.id, action: "supplier_email_drafted",
    entityType: "exception_case", entityId: exc.id, metadataJson: JSON.stringify({ ok: result.ok }),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const [comm] = await db.insert(supplierCommunications).values({
    exceptionId: exc.id, supplierId: exc.supplierId, recipientEmail: supplier?.contactEmail ?? null,
    subject: result.draft.subject, body: result.draft.body, status: "draft",
  }).returning();

  return NextResponse.json({ communicationId: comm.id, subject: comm.subject, body: comm.body, recipientEmail: comm.recipientEmail });
}
