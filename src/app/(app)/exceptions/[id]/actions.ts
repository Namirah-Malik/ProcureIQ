"use server";

import { db } from "@/db/client";
import { exceptionCases, auditEvents, exceptionComments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ["in_review"],
  in_review: ["awaiting_supplier", "awaiting_approval", "resolved", "open"],
  awaiting_supplier: ["in_review", "resolved"],
  awaiting_approval: ["in_review", "resolved"],
  resolved: ["open"], // reopen only
};

export async function changeStatus(exceptionId: string, newStatus: string) {
  const session = await getSession();
  if (!session) throw new Error("No organization context");

  const [exc] = await db.select().from(exceptionCases).where(eq(exceptionCases.id, exceptionId));
  if (!exc || exc.orgId !== session.org.id) throw new Error("Exception not found");

  const allowed = ALLOWED_TRANSITIONS[exc.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${exc.status} to ${newStatus}`);
  }

  await db.update(exceptionCases).set({ status: newStatus as any, updatedAt: new Date() }).where(eq(exceptionCases.id, exceptionId));
  await db.insert(auditEvents).values({
    orgId: session.org.id,
    actorUserId: session.user?.id,
    action: "exception_status_changed",
    entityType: "exception_case",
    entityId: exceptionId,
    metadataJson: JSON.stringify({ from: exc.status, to: newStatus }),
  });

  revalidatePath(`/exceptions/${exceptionId}`);
}

export async function resolveException(exceptionId: string, reason: string, notes: string) {
  const session = await getSession();
  if (!session) throw new Error("No organization context");
  if (!reason.trim() || !notes.trim()) throw new Error("A resolution reason and explanation are required");

  const [exc] = await db.select().from(exceptionCases).where(eq(exceptionCases.id, exceptionId));
  if (!exc || exc.orgId !== session.org.id) throw new Error("Exception not found");
  if (exc.status === "resolved") throw new Error("Already resolved");

  await db
    .update(exceptionCases)
    .set({
      status: "resolved",
      resolutionReason: reason,
      resolutionNotes: notes,
      resolvedAt: new Date(),
      resolvedByUserId: session.user?.id,
      updatedAt: new Date(),
    })
    .where(eq(exceptionCases.id, exceptionId));

  await db.insert(auditEvents).values({
    orgId: session.org.id,
    actorUserId: session.user?.id,
    action: "exception_resolved",
    entityType: "exception_case",
    entityId: exceptionId,
    metadataJson: JSON.stringify({ reason }),
  });

  revalidatePath(`/exceptions/${exceptionId}`);
  revalidatePath("/exceptions");
}

export async function addNote(exceptionId: string, body: string) {
  const session = await getSession();
  if (!session) throw new Error("No organization context");
  if (!body.trim()) throw new Error("Note cannot be empty");

  await db.insert(exceptionComments).values({ exceptionId, userId: session.user?.id, kind: "note", body });
  await db.insert(auditEvents).values({
    orgId: session.org.id,
    actorUserId: session.user?.id,
    action: "exception_note_added",
    entityType: "exception_case",
    entityId: exceptionId,
  });
  revalidatePath(`/exceptions/${exceptionId}`);
}
