import type { Config } from "drizzle-kit";

// Local dev / CI: push schema into the PGlite data folder (no real DB needed).
// Production: set DATABASE_URL to a real Postgres connection string (e.g. Neon)
// and run `npx drizzle-kit push` with that env var set, or use drizzle-kit
// generate + migrate for versioned migrations in CI/CD.
const databaseUrl = process.env.DATABASE_URL;

export default (databaseUrl && databaseUrl.startsWith("postgres")
  ? {
      schema: "./src/db/schema.ts",
      out: "./drizzle",
      dialect: "postgresql",
      dbCredentials: { url: databaseUrl },
    }
  : {
      schema: "./src/db/schema.ts",
      out: "./drizzle",
      dialect: "postgresql",
      driver: "pglite",
      dbCredentials: { url: process.env.PGLITE_DATA_DIR || "./.pglite-data" },
    }) satisfies Config;
