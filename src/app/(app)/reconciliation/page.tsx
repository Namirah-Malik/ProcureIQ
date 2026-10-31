import { db } from "@/db/client";
import { reconciliationRuns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { runReconciliation } from "@/domain/reconciliation";
import { revalidatePath } from "next/cache";

export default async function ReconciliationPage() {
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;

  const runs = await db
    .select()
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.orgId, session.org.id))
    .orderBy(desc(reconciliationRuns.startedAt));

  async function startRun() {
    "use server";
    const s = await getSession();
    if (!s) return;
    await runReconciliation(s.org.id, s.user?.id);
    revalidatePath("/reconciliation");
    revalidatePath("/overview");
    revalidatePath("/exceptions");
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reconciliation Runs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Runs the deterministic matching engine against all purchase orders, invoices, and goods receipts
            in your organization. Re-running is idempotent — it will not create duplicate exceptions for unchanged data.
          </p>
        </div>
        <form action={startRun}>
          <button className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md whitespace-nowrap">
            Start reconciliation
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {runs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No reconciliation runs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-2.5 font-medium">Run</th>
                <th className="px-3 py-2.5 font-medium">Started</th>
                <th className="px-3 py-2.5 font-medium">Completed</th>
                <th className="px-3 py-2.5 font-medium">Documents considered</th>
                <th className="px-3 py-2.5 font-medium">Exceptions detected</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-800 font-mono text-xs">{r.id.slice(0, 8)}</td>
                  <td className="px-3 py-3 text-slate-500">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-3 text-slate-500">{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{r.documentsConsidered}</td>
                  <td className="px-3 py-3 text-slate-700">{r.exceptionsDetected}</td>
                  <td className="px-3 py-3 capitalize text-slate-500">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
