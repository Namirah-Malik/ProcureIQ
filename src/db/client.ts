import * as schema from "./schema";

// Two modes, selected by DATABASE_URL:
//
// 1. No DATABASE_URL -> PGlite, a real Postgres engine compiled to WASM that
//    persists to a local folder. Zero cost, zero external service. This is what
//    `npm run dev` uses out of the box, with no setup required.
//
// 2. DATABASE_URL is a real postgres:// connection string (e.g. Neon's free
//    tier) -> connects via @neondatabase/serverless. This is what you set in
//    Vercel's environment variables for the deployed app.
//
// Both paths share the exact same schema.ts and the exact same query code
// throughout the rest of the app — only this file knows which database it's
// actually talking to.

const databaseUrl = process.env.DATABASE_URL;

async function createDb() {
  if (databaseUrl && databaseUrl.startsWith("postgres")) {
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(databaseUrl);
    return drizzle(sql, { schema });
  }
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR || "./.pglite-data";
  const client = new PGlite(dataDir);
  return drizzle(client, { schema });
}

// Top-level await: every server module that does `import { db } from "@/db/client"`
// gets a ready-to-use instance with no change to existing query code.
export const db = await createDb();
