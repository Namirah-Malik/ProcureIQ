# ProcureIQ

AI-assisted procurement exception resolution & reconciliation platform. Detects price, quantity,
duplicate-invoice, and missing-record discrepancies across purchase orders, vendor invoices, and
goods-received notes using deterministic business logic, then helps a human investigate and resolve
them with AI-assisted (never AI-decided) explanations and supplier email drafts.

Multi-tenant: anyone can sign up, which creates their own private organization. Every query is scoped
to the signed-in user's organization — one company's data is never visible to another's.

This README describes what is actually implemented, what's stubbed, and how to run and deploy it —
not an aspirational feature list.

## Quick start (local, free, zero setup)

```bash
npm install
npm run db:push       # creates the schema in a local PGlite database (real Postgres engine, runs as WASM)
npm run db:seed        # loads one demo organization with realistic data
npm run dev              # http://localhost:3000
```

Sign in with any of the seeded demo accounts and password `procureiq-demo` (shown by `db:seed`), or
go to `/sign-up` and create your own organization from scratch — this is exactly the flow real
colleagues will use.

```bash
npm run build && npm start   # production build — requires db:push + db:seed to have run first
npm test                      # Vitest suite for the domain layer (16 tests)
```

## Deploying to Vercel (free to start)

This gets you a real, publicly reachable URL at $0, using free tiers throughout. Read "Where this
stops being free" below before inviting a lot of people.

**1. Create a free Postgres database on [Neon](https://neon.tech).**
Sign up, create a project, copy the connection string it gives you (starts with `postgres://`).

**2. Push the schema to that real database once, from your machine:**
```bash
DATABASE_URL="postgres://...from neon..." npx drizzle-kit push
DATABASE_URL="postgres://...from neon..." npx tsx src/db/seed.ts   # optional: loads demo data
```

**3. Generate an auth secret:**
```bash
openssl rand -base64 32
```

**4. Push this repo to GitHub, then import it in [Vercel](https://vercel.com) (free Hobby plan).**
In the project's Environment Variables, set:
- `DATABASE_URL` — the Neon connection string from step 1
- `AUTH_SECRET` — the value from step 3

Deploy. That's it — Vercel builds and hosts it, Neon holds the data, and anyone you send the URL to
can sign up and start using it under their own organization.

**5. (Optional) Enable the AI features.** See "Setting up the AI features" below. Until you add a key,
the "Explain this discrepancy" and "Draft clarification email" buttons fail safely with a clear error
message — everything else in the app keeps working.

## Setting up the AI features

The "Explain this discrepancy" and "Draft clarification email" buttons call Anthropic's API directly.
This requires your own API key (separate from a claude.ai subscription — API usage is billed per
request, with no monthly flat fee).

**1. Get a key:**
- Go to [console.anthropic.com](https://console.anthropic.com) and sign up
- Add a payment method (API usage isn't free — see cost note below)
- Go to **API Keys → Create Key**, copy the value (starts with `sk-ant-`)

**2. Add it to your deployment:**
- **Local dev**: create a `.env` file in the project root (never commit this) with:
  ```
  ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
  ```
- **Vercel**: Project Settings → Environment Variables → add `ANTHROPIC_API_KEY` with the same value,
  then redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new variable takes effect.

**3. Verify it worked:** open `/settings` in the app — it shows a green "API key configured" badge
once the key is live, or an amber "not configured" badge if something's still missing.

**Cost reality:** each click of "Explain" or "Draft email" is one short API call — typically a fraction
of a cent each at current Anthropic pricing, but it is real money with no free allowance once you add a
key. If you want to try it without any financial commitment at all, skip this section — the rest of the
app (upload, reconciliation, exceptions, dashboards, audit log) works fully without it.

## Where this stops being free

Being straight about this so there are no surprises:
- **Neon's free tier**: generous for a small team's real usage, but has storage and compute-hour caps.
  You'll get an email from Neon before anything breaks.
- **Vercel's free Hobby plan**: fine for internal/team tools, but its terms restrict it from commercial
  use at a certain point, and it has bandwidth/function-execution limits. If this genuinely becomes a
  company tool, Vercel Pro (~$20/month) removes those restrictions.
- **The Anthropic API** (AI explain / draft email buttons): real per-use cost, no free tier once you
  supply your own key (see "Setting up the AI features" above). This is the one cost that scales
  directly with how much people actually use the AI features — everything else in the app (upload,
  reconciliation, exceptions, audit log, dashboards, sign-up/sign-in) has zero marginal cost no matter
  how many people use it. Until you add a key, those two buttons fail with a clear in-app message
  instead of crashing or costing anything.

None of these costs anything until you deliberately take the step that incurs it (adding a billing
method to Neon/Vercel, or adding an Anthropic key). Nothing in this app charges you by surprise.

## What's real vs. what's stubbed

**Fully implemented and tested:**
- **Real multi-user authentication** (Auth.js v5): email + bcrypt-hashed password, JWT sessions (no
  extra DB table needed). `/sign-up` creates a new organization and its first admin user; `/sign-in`
  authenticates into an existing one. Middleware protects every page and redirects signed-out visitors.
  Every database query is scoped to `session.user.orgId` — verified by an end-to-end test: a second
  organization created via sign-up sees none of another organization's data.
- **Postgres via Drizzle ORM.** Local dev uses PGlite (a real Postgres engine compiled to WASM — no
  install, no external service, $0). Production points `DATABASE_URL` at a real hosted Postgres (Neon).
  Same schema, same query code, both paths verified by actually running the full chain (push → seed →
  test → build) against each.
- Deterministic reconciliation engine (`src/domain/reconciliation.ts`): PO-vs-invoice price variance,
  invoice-vs-GRN quantity variance, duplicate invoice detection, missing-counterpart detection.
  Idempotent — re-running with unchanged data creates zero new exceptions.
- Document import pipeline (`src/domain/import.ts`): CSV/XLSX upload → extraction → Zod schema
  validation → duplicate-PO guard → persistence, with file-size/extension/path-traversal checks.
- Exception investigation workspace: evidence comparison, financial-impact breakdown (estimate vs.
  confirmed), explicit status-transition rules, a resolution form requiring a reason + explanation.
- AI explanation and AI email drafting: server-side only, Zod-validated structured output, 20s timeout
  with safe failure, system prompt forbids inventing facts and treats document content as data, never
  instructions. Every AI call is audit-logged.
- Append-only audit log across imports, reconciliation runs, exceptions, resolutions, and AI requests.
- Money stored and calculated entirely in integer minor units — never floating point.
- 16 passing Vitest tests covering money math, reconciliation rules (including idempotency), and import
  validation/duplicate/security checks, run against the same real Postgres engine (PGlite) as local dev.

**Stubbed or not yet built:**
- **PDF/OCR extraction** — only CSV/XLSX import is implemented.
- **Email sending** — no provider connected. "Record sent" lets a human confirm they manually sent an
  AI-drafted email; it never sends on the app's behalf, by design.
- **Playwright E2E tests, in-app user management/invitations (new teammates currently need to sign up
  themselves), bulk exception actions, saved views, CSV export** — not built.
- **Password reset / email verification** — sign-up takes a password immediately with no email
  confirmation step. Fine for an internal team tool; add before this is customer-facing.

## Architecture

```
src/
  db/
    schema.ts         # Drizzle schema (Postgres): orgs, users, suppliers, products, POs, invoices,
                       # GRNs, reconciliation runs, exceptions, comments, communications, audit log
    client.ts          # DB connection — PGlite locally, Neon in production, picked by DATABASE_URL
    seed.ts              # Realistic demo data + one full reconciliation run
  auth.config.ts     # Edge-safe Auth.js config (used by middleware — no Node-only imports)
  auth.ts               # Full Auth.js config with the credentials provider (Node runtime only)
  middleware.ts       # Route protection, built on auth.config.ts
  domain/
    reconciliation.ts    # Deterministic matching + variance + duplicate + missing-record engine
    import.ts              # CSV/XLSX import pipeline
    ai-explain.ts             # Evidence-grounded AI explanation (Zod-validated)
    ai-email.ts                 # AI supplier email drafting (Zod-validated)
    *.test.ts                     # Vitest suites
  lib/
    money.ts            # Integer minor-unit arithmetic, currency formatting
    session.ts             # Real session helper — wraps auth() and loads the user's organization
  app/
    sign-in/, sign-up/    # Public auth pages
    (app)/                   # Authenticated app shell + pages
    api/                        # Route handlers: auth, upload, AI explain, AI email draft, record-sent
```

## Why Drizzle instead of Prisma, and why PGlite for local dev

The original spec asked for Prisma. The sandbox this was built in blocks the binary download Prisma's
CLI needs, so Drizzle (pure TypeScript, no native binary fetch) was used instead — the schema has the
same entities, foreign keys, and constraints either way.

For local development, PGlite (a real Postgres engine compiled to WASM) is used instead of requiring
every developer to install and run their own Postgres server. It's genuinely Postgres — same SQL
dialect, same types — not a compatibility shim, so the schema and queries that work locally work
unchanged against Neon in production. Note: `next.config.ts` marks PGlite as a `serverExternalPackage`
because Next's bundler otherwise mishandles how PGlite locates its own WASM assets at runtime; this is
a local-dev-only concern and doesn't affect the production (Neon) path at all.

## Business rules implemented

- **Price variance** = (invoiced unit price − PO unit price) × invoiced quantity, flagged when the
  percentage difference exceeds the org's tolerance (default 1%, `organizations.priceTolerancePct`).
- **Quantity variance** = invoiced quantity − total received quantity across matched GRNs, exposure =
  variance × unit price.
- **Duplicate invoices**: same supplier + normalized invoice number. Exact amount match → `high`
  severity, confirmed; amount mismatch → `medium` severity, "likely", requires human confirmation.
- **Missing records**: an invoice with no matched PO, or no GRN linked to its PO, is flagged
  `missing_record` with impact explicitly labeled unconfirmed/estimated.
- **Severity**: driven by absolute potential exposure against configurable thresholds — not an LLM
  judgment call.
- Financial exposure is always labeled estimate vs. confirmed and never silently summed across
  independent discrepancy types as one confirmed loss.

## Known limitations

See "Stubbed or not yet built" above. The matching engine matches PO/invoice/GRN lines by product ID
first, then normalized description — it does not yet use supplier-specific SKU aliases (the
`productAliases` table exists in the schema but isn't populated/used by the matcher yet), unit-of-
measure conversion, or multi-currency normalization.
