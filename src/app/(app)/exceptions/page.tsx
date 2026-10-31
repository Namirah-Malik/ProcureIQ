import { db } from "@/db/client";
import { exceptionCases, suppliers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

function severityBadge(sev: string) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return map[sev] ?? map.low;
}

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;

  let rows = await db.select().from(exceptionCases).where(eq(exceptionCases.orgId, session.org.id));
  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.type) rows = rows.filter((r) => r.type === sp.type);
  rows = rows.sort((a, b) => b.potentialExposureMinor - a.potentialExposureMinor);

  const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.orgId, session.org.id));
  const supplierName = (id: string | null) => allSuppliers.find((s) => s.id === id)?.name ?? "—";

  const statuses = ["open", "in_review", "awaiting_supplier", "awaiting_approval", "resolved"];
  const types = ["price_variance", "quantity_variance", "duplicate_invoice", "missing_record", "delivery_delay", "tax_freight_variance"];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Exceptions</h1>
          <p className="text-sm text-slate-500 mt-0.5">{rows.length} case{rows.length === 1 ? "" : "s"} matching current filters</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="All statuses" href="/exceptions" active={!sp.status} />
        {statuses.map((s) => (
          <FilterLink key={s} label={s.replaceAll("_", " ")} href={`/exceptions?status=${s}${sp.type ? `&type=${sp.type}` : ""}`} active={sp.status === s} />
        ))}
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <FilterLink label="All types" href={sp.status ? `/exceptions?status=${sp.status}` : "/exceptions"} active={!sp.type} subtle />
        {types.map((t) => (
          <FilterLink key={t} label={t.replaceAll("_", " ")} href={`/exceptions?type=${t}${sp.status ? `&status=${sp.status}` : ""}`} active={sp.type === t} subtle />
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No exceptions match these filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-2.5 font-medium">Title</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Supplier</th>
                <th className="px-3 py-2.5 font-medium">Severity</th>
                <th className="px-3 py-2.5 font-medium text-right">Exposure</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/exceptions/${e.id}`} className="text-slate-800 hover:text-indigo-600 font-medium">{e.title}</Link>
                  </td>
                  <td className="px-3 py-3 text-slate-600 capitalize">{e.type.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 text-slate-600">{supplierName(e.supplierId)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${severityBadge(e.severity)}`}>{e.severity}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {e.exposureIsEstimate && "~"}{formatMoney(e.potentialExposureMinor, e.exposureCurrency)}
                  </td>
                  <td className="px-3 py-3 text-slate-500 capitalize">{e.status.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterLink({ label, href, active, subtle }: { label: string; href: string; active?: boolean; subtle?: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs px-2.5 py-1 rounded-full border capitalize ${
        active
          ? "bg-indigo-600 border-indigo-600 text-white"
          : subtle
          ? "border-slate-200 text-slate-500 hover:border-slate-300"
          : "border-slate-200 text-slate-600 hover:border-slate-300"
      }`}
    >
      {label}
    </Link>
  );
}
