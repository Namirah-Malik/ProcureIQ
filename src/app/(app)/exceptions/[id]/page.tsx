import { db } from "@/db/client";
import {
  exceptionCases, suppliers, purchaseOrders, invoices, goodsReceipts, exceptionComments,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { notFound } from "next/navigation";
import AiExplainPanel from "@/components/AiExplainPanel";
import SupplierEmailPanel from "@/components/SupplierEmailPanel";
import { changeStatus, resolveException, addNote } from "./actions";
import type { Explanation } from "@/domain/ai-explain";

export default async function ExceptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const [exc] = await db.select().from(exceptionCases).where(eq(exceptionCases.id, id));
  if (!exc || exc.orgId !== session.org.id) notFound();

  const supplier = exc.supplierId ? (await db.select().from(suppliers).where(eq(suppliers.id, exc.supplierId)))[0] : null;
  const po = exc.purchaseOrderId ? (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, exc.purchaseOrderId)))[0] : null;
  const inv = exc.invoiceId ? (await db.select().from(invoices).where(eq(invoices.id, exc.invoiceId)))[0] : null;
  const grn = exc.goodsReceiptId ? (await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, exc.goodsReceiptId)))[0] : null;

  const comments = await db
    .select()
    .from(exceptionComments)
    .where(eq(exceptionComments.exceptionId, exc.id))
    .orderBy(asc(exceptionComments.createdAt));

  const notes = comments.filter((c) => c.kind === "note");
  const lastAi = [...comments].reverse().find((c) => c.kind === "ai_analysis");
  let aiInitial: Explanation | null = null;
  if (lastAi) {
    try { aiInitial = JSON.parse(lastAi.body); } catch {}
  }

  const calc = JSON.parse(exc.calculationDetailsJson) as {
    expected: number | null; actual: number | null; variance: number | null;
    method: string; assumptions: string[]; isEstimate: boolean;
  };

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    open: ["in_review"],
    in_review: ["awaiting_supplier", "awaiting_approval", "resolved", "open"],
    awaiting_supplier: ["in_review", "resolved"],
    awaiting_approval: ["in_review", "resolved"],
    resolved: ["open"],
  };
  const nextStates = ALLOWED_TRANSITIONS[exc.status] ?? [];

  async function doChangeStatus(formData: FormData) {
    "use server";
    await changeStatus(exc.id, String(formData.get("status")));
  }
  async function doResolve(formData: FormData) {
    "use server";
    await resolveException(exc.id, String(formData.get("reason")), String(formData.get("notes")));
  }
  async function doAddNote(formData: FormData) {
    "use server";
    await addNote(exc.id, String(formData.get("body")));
  }

  const isMoney = (v: number | null) => typeof v === "number" && !["quantity_variance"].includes(exc.type) ? v !== null : false;
  const formatCalc = (v: number | null, forMoney: boolean) =>
    v === null ? "unknown" : forMoney ? formatMoney(v, exc.exposureCurrency) : v.toString();
  const moneyField = exc.type !== "quantity_variance" && exc.type !== "duplicate_invoice";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-400 mb-1">Exception {exc.id.slice(0, 8)}</div>
          <h1 className="text-xl font-semibold text-slate-900">{exc.title}</h1>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <Badge>{exc.severity}</Badge>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 capitalize">{exc.status.replaceAll("_", " ")}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{supplier?.name ?? "Unknown supplier"}</span>
          </div>
        </div>
        {nextStates.length > 0 && (
          <form action={doChangeStatus} className="flex items-center gap-2">
            <select name="status" className="text-sm border border-slate-300 rounded-md px-2 py-1.5" defaultValue={nextStates[0]}>
              {nextStates.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
            <button className="text-sm bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-md">Change status</button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">Financial impact</h2>
            </div>
            <div className="p-5 grid grid-cols-3 gap-4 text-sm">
              <Field label="Expected">{formatCalc(calc.expected, moneyField)}</Field>
              <Field label="Actual">{formatCalc(calc.actual, moneyField)}</Field>
              <Field label="Variance">{formatCalc(calc.variance, moneyField)}</Field>
              <div className="col-span-3 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Calculation method</div>
                <p className="text-slate-700">{calc.method}</p>
              </div>
              <div className="col-span-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Assumptions</div>
                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                  {calc.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
              <div className="col-span-3 text-xs text-slate-500">
                Potential exposure: <span className="font-medium text-slate-800">{formatMoney(exc.potentialExposureMinor, exc.exposureCurrency)}</span>{" "}
                — {exc.exposureIsEstimate ? "estimated, not a confirmed loss" : "confirmed"}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">Related records</h2>
            </div>
            <div className="p-5 grid grid-cols-3 gap-4 text-sm">
              <RecordRef label="Purchase order" value={po?.poNumber} />
              <RecordRef label="Invoice" value={inv?.invoiceNumber} />
              <RecordRef label="Goods receipt" value={grn?.grnNumber} />
            </div>
          </div>

          <AiExplainPanel exceptionId={exc.id} initial={aiInitial} />

          <SupplierEmailPanel exceptionId={exc.id} />

          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">Investigation notes</h2>
            </div>
            <div className="p-5 space-y-3">
              {notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="text-sm border border-slate-100 rounded-md p-3">
                  <div className="text-xs text-slate-400 mb-1">{new Date(n.createdAt).toLocaleString()}</div>
                  <div className="text-slate-700">{n.body}</div>
                </div>
              ))}
              <form action={doAddNote} className="flex gap-2 pt-2">
                <input name="body" placeholder="Add an investigation note..." className="flex-1 text-sm border border-slate-300 rounded-md px-3 py-1.5" />
                <button className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md">Add</button>
              </form>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {exc.status !== "resolved" ? (
            <div className="bg-white border border-slate-200 rounded-lg">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-800">Resolve exception</h2>
              </div>
              <form action={doResolve} className="p-5 space-y-3">
                <div>
                  <label className="text-xs text-slate-500">Resolution reason</label>
                  <select name="reason" required className="w-full mt-1 text-sm border border-slate-300 rounded-md px-2 py-1.5">
                    <option value="">Select a reason...</option>
                    <option value="supplier_credit_issued">Supplier credit issued</option>
                    <option value="price_confirmed_correct">Contract price re-confirmed as correct</option>
                    <option value="duplicate_cancelled">Duplicate invoice cancelled</option>
                    <option value="partial_delivery_confirmed">Partial delivery confirmed, remainder pending</option>
                    <option value="documentation_corrected">Documentation corrected</option>
                    <option value="written_off">Immaterial, written off</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Explanation</label>
                  <textarea name="notes" required rows={4} className="w-full mt-1 text-sm border border-slate-300 rounded-md px-2 py-1.5" placeholder="What was found and why this resolves the case..." />
                </div>
                <button className="w-full text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-md">Resolve exception</button>
                <p className="text-[11px] text-slate-400">Requires a reason and explanation — an AI suggestion alone cannot resolve a case.</p>
              </form>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">Resolved</h2>
              <p className="text-sm text-slate-600"><span className="text-slate-400">Reason:</span> {exc.resolutionReason}</p>
              <p className="text-sm text-slate-600 mt-1">{exc.resolutionNotes}</p>
              <p className="text-xs text-slate-400 mt-2">{exc.resolvedAt && new Date(exc.resolvedAt).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${map[children] ?? map.low}`}>{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-slate-800 font-medium tabular-nums">{children}</div>
    </div>
  );
}

function RecordRef({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
