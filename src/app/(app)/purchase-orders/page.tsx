import { db } from "@/db/client";
import { purchaseOrders, suppliers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export default async function PurchaseOrdersPage() {
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;

  const pos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.orgId, session.org.id));
  const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.orgId, session.org.id));
  const supplierName = (id: string) => allSuppliers.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Purchase Orders</h1>
      <p className="text-sm text-slate-500 mb-5">{pos.length} purchase order{pos.length === 1 ? "" : "s"}</p>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-5 py-2.5 font-medium">PO number</th>
              <th className="px-3 py-2.5 font-medium">Supplier</th>
              <th className="px-3 py-2.5 font-medium">Order date</th>
              <th className="px-3 py-2.5 font-medium">Expected delivery</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((po) => (
              <tr key={po.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 text-slate-800 font-medium">{po.poNumber}</td>
                <td className="px-3 py-3 text-slate-600">{supplierName(po.supplierId)}</td>
                <td className="px-3 py-3 text-slate-500">{po.orderDate}</td>
                <td className="px-3 py-3 text-slate-500">{po.expectedDeliveryDate ?? "—"}</td>
                <td className="px-3 py-3 text-slate-500 capitalize">{po.status.replaceAll("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
