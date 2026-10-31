import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no providers, no Node-only imports (bcrypt, DB drivers).
// Middleware runs in the Edge runtime on Vercel, which cannot load Node APIs —
// so middleware must only ever import this file, never the full auth.ts below.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.orgId = (user as any).orgId;
        token.orgName = (user as any).orgName;
        token.role = (user as any).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.orgId = token.orgId as string;
      session.user.orgName = token.orgName as string;
      session.user.role = token.role as string;
      return session;
    },
  },
  providers: [], // populated in auth.ts (full, Node runtime only)
};
