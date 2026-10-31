import { db } from "@/db/client";
import { suppliers, exceptionCases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";

export default async function SuppliersPage() {
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;

  const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.orgId, session.org.id));
  const allExceptions = await db.select().from(exceptionCases).where(eq(exceptionCases.orgId, session.org.id));

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Suppliers</h1>
      <p className="text-sm text-slate-500 mb-5">{allSuppliers.length} supplier{allSuppliers.length === 1 ? "" : "s"}</p>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-5 py-2.5 font-medium">Supplier</th>
              <th className="px-3 py-2.5 font-medium">Code</th>
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <th className="px-3 py-2.5 font-medium">Open exceptions</th>
              <th className="px-3 py-2.5 font-medium text-right">Potential exposure</th>
            </tr>
          </thead>
          <tbody>
            {allSuppliers.map((s) => {
              const theirs = allExceptions.filter((e) => e.supplierId === s.id);
              const open = theirs.filter((e) => e.status !== "resolved");
              const exposure = open.reduce((sum, e) => sum + e.potentialExposureMinor, 0);
              return (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-800 font-medium">{s.name}</td>
                  <td className="px-3 py-3 text-slate-500">{s.code}</td>
                  <td className="px-3 py-3 text-slate-500">{s.contactEmail ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{open.length}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(exposure, session.org.defaultCurrency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
