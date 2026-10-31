import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { users, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string;
      orgName: string;
      role: string;
      name: string;
      email: string;
    };
  }
}

// Full config: runs only in the Node.js runtime (route handlers, server
// components, server actions) — never in Edge middleware. This is the only
// file allowed to import bcrypt or the database client for auth purposes.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
        if (!org) return null;

        return {
          id: user.id,
          orgId: user.orgId,
          orgName: org.name,
          role: user.role,
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
});
