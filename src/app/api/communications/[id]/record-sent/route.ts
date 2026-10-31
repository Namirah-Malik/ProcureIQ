import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { supplierCommunications, auditEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

// No email-sending integration is configured in this build. This endpoint only
// lets a human record that they manually sent the drafted email themselves —
// it never sends anything on the application's behalf, and the UI must make
// that distinction clear to the user.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No organization context" }, { status: 401 });

  const [comm] = await db.select().from(supplierCommunications).where(eq(supplierCommunications.id, id));
  if (!comm) return NextResponse.json({ error: "Communication not found" }, { status: 404 });

  await db.update(supplierCommunications).set({ status: "recorded_sent", updatedAt: new Date() }).where(eq(supplierCommunications.id, id));
  await db.insert(auditEvents).values({
    orgId: session.org.id, actorUserId: session.user?.id, action: "supplier_email_recorded_sent",
    entityType: "supplier_communication", entityId: id,
  });

  return NextResponse.json({ ok: true });
}
