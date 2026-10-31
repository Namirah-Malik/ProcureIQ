import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { organizations, users, auditEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

const signUpSchema = z.object({
  orgName: z.string().min(2, "Organization name is too short").max(200),
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { orgName, name, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Try signing in instead." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [org] = await db.insert(organizations).values({ name: orgName }).returning();
  const [user] = await db.insert(users).values({
    orgId: org.id, name, email: normalizedEmail, passwordHash, role: "admin",
  }).returning();

  await db.insert(auditEvents).values({
    orgId: org.id, actorUserId: user.id, action: "organization_created",
    entityType: "organization", entityId: org.id, metadataJson: JSON.stringify({ via: "sign_up" }),
  });

  return NextResponse.json({ ok: true });
}
