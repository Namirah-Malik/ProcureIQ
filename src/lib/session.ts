import { auth } from "@/auth";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

// Real authenticated session, scoped to the signed-in user's own organization.
// Every page and API route calls this instead of trusting any client-supplied
// org/user id, so one tenant can never see another's data.
export async function getSession() {
  const session = await auth();
  if (!session?.user) return null;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.user.orgId));
  if (!org) return null;

  return {
    org,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    },
  };
}
