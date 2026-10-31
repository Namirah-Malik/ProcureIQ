import { db } from "@/db/client";
import { exceptionCases, reconciliationRuns, procurementDocuments, suppliers, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import Link from "next/link";
import { AlertTriangle, FileStack, IndianRupee, Clock } from "lucide-react";

function severityBadge(sev: string) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return map[sev] ?? map.low;
}

export default async function OverviewPage() {
  const session = await getSession();
  if (!session) {
    return <Empty message="No organization found. Run `npm run db:seed` to load demo data." />;
  }
  const orgId = session.org.id;

  const allExceptions = await db.select().from(exceptionCases).where(eq(exceptionCases.orgId, orgId));
  const open = allExceptions.filter((e) => e.status !== "resolved");
  const critical = open.filter((e) => e.severity === "critical" || e.severity === "high");
  const resolved = allExceptions.filter((e) => e.status === "resolved");
  const totalExposureMinor = open.reduce((s, e) => s + e.potentialExposureMinor, 0);
  const docs = await db.select().from(procurementDocuments).where(eq(procurementDocuments.orgId, orgId));
  const allUsers = await db.select().from(users);
  const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.orgId, orgId));

  const priorityExceptions = [...open]
    .sort((a, b) => b.potentialExposureMinor - a.potentialExposureMinor)
    .slice(0, 6);

  const byType: Record<string, number> = {};
  for (const e of open) byType[e.type] = (byType[e.type] ?? 0) + 1;

  const lastRuns = await db
    .select()
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.orgId, orgId))
    .orderBy(desc(reconciliationRuns.startedAt))
    .limit(5);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">What needs attention today, based on live reconciliation data.</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard icon={FileStack} label="Documents processed" value={docs.length.toString()} />
        <MetricCard icon={AlertTriangle} label="Open exceptions" value={open.length.toString()} sub={`${critical.length} high/critical`} />
        <MetricCard
          icon={IndianRupee}
          label="Potential exposure (open)"
          value={formatMoney(totalExposureMinor, session.org.defaultCurrency)}
          sub="Estimated, not confirmed loss"
        />
        <MetricCard icon={Clock} label="Resolved" value={resolved.length.toString()} sub={`of ${allExceptions.length} total cases`} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Priority exceptions</h2>
            <Link href="/exceptions" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </div>
          {priorityExceptions.length === 0 ? (
            <Empty message="No open exceptions. Run reconciliation to detect discrepancies." compact />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-5 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium text-right">Exposure</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {priorityExceptions.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link href={`/exceptions/${e.id}`} className="text-slate-800 hover:text-indigo-600 font-medium">
                        {e.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${severityBadge(e.severity)}`}>{e.severity}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {e.exposureIsEstimate && "~"}{formatMoney(e.potentialExposureMinor, e.exposureCurrency)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 capitalize">{e.status.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-800">Exception distribution</h2>
          </div>
          <div className="p-5 space-y-3">
            {Object.keys(byType).length === 0 ? (
              <p className="text-sm text-slate-400">No exceptions detected yet.</p>
            ) : (
              Object.entries(byType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 capitalize">{type.replaceAll("_", " ")}</span>
                  <span className="font-medium text-slate-800">{count}</span>
                </div>
              ))
            )}
          </div>
          <div className="px-5 py-3.5 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Recent reconciliation runs</h2>
            {lastRuns.length === 0 ? (
              <p className="text-sm text-slate-400">No runs yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {lastRuns.map((r) => (
                  <li key={r.id} className="text-xs text-slate-600 flex justify-between">
                    <span>{new Date(r.startedAt).toLocaleString()}</span>
                    <span className="capitalize">{r.status} · {r.exceptionsDetected} found</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 text-xs text-slate-400">
        {allSuppliers.length} suppliers · {allUsers.length} users in this organization
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Empty({ message, compact }: { message: string; compact?: boolean }) {
  return (
    <div className={compact ? "px-5 py-8 text-center text-sm text-slate-400" : "p-10 text-center text-sm text-slate-400"}>
      {message}
    </div>
  );
}
