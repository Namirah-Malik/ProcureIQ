import { getSession } from "@/lib/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;
  const orgUsers = await db.select().from(users).where(eq(users.orgId, session.org.id));

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Organization</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Name" value={session.org.name} />
          <Row label="Default currency" value={session.org.defaultCurrency} />
        </dl>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Reconciliation rules</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Price variance tolerance" value={`${session.org.priceTolerancePct}%`} />
          <Row label="Quantity tolerance" value={`${session.org.quantityToleranceUnits} units`} />
        </dl>
        <p className="text-xs text-slate-400 mt-3">
          Editing these from the UI is not wired up yet in this build stage — they are read from the organization row
          and consumed by the reconciliation engine in <code>src/domain/reconciliation.ts</code>.
        </p>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">AI configuration</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Provider" value="Anthropic API (server-side)" />
          <Row label="Model" value="claude-sonnet-4-6" />
          <Row label="Timeout" value="20s, with safe failure" />
          <Row label="Output validation" value="Zod schema, strict" />
        </dl>
        <div className="mt-3">
          {process.env.ANTHROPIC_API_KEY ? (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              API key configured — AI features are active
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              No ANTHROPIC_API_KEY set — AI explain / email draft will show a clear error until one is added
            </span>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Users</h2>
        <table className="w-full text-sm">
          <tbody>
            {orgUsers.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 text-slate-800">{u.name}</td>
                <td className="py-1.5 text-slate-500">{u.email}</td>
                <td className="py-1.5 text-slate-500 capitalize">{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}
