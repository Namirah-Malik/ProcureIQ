import { db } from "@/db/client";
import { exceptionCases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;

  const all = await db.select().from(exceptionCases).where(eq(exceptionCases.orgId, session.org.id));
  const resolved = all.filter((e) => e.status === "resolved" && e.resolvedAt);
  const avgResolutionHours = resolved.length
    ? resolved.reduce((sum, e) => sum + (new Date(e.resolvedAt!).getTime() - new Date(e.createdAt).getTime()), 0) /
      resolved.length / (1000 * 60 * 60)
    : null;

  const byType: Record<string, { count: number; exposure: number }> = {};
  for (const e of all) {
    byType[e.type] = byType[e.type] ?? { count: 0, exposure: 0 };
    byType[e.type].count++;
    byType[e.type].exposure += e.potentialExposureMinor;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Analytics & Reports</h1>
      <p className="text-sm text-slate-500 mb-5">Calculated directly from stored exception and reconciliation records.</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total exceptions" value={all.length.toString()} />
        <StatCard label="Resolved" value={resolved.length.toString()} sub={`${all.length ? Math.round((resolved.length / all.length) * 100) : 0}% of total`} />
        <StatCard
          label="Avg. resolution time"
          value={avgResolutionHours === null ? "—" : `${avgResolutionHours.toFixed(1)}h`}
          sub="From creation to resolvedAt timestamp"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Exceptions by type</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-5 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Count</th>
              <th className="px-3 py-2.5 font-medium text-right">Total potential exposure</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byType).map(([type, v]) => (
              <tr key={type} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-2.5 text-slate-800 capitalize">{type.replaceAll("_", " ")}</td>
                <td className="px-3 py-2.5 text-slate-600">{v.count}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatMoney(v.exposure, session.org.defaultCurrency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
