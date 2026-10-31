import { db } from "@/db/client";
import { procurementDocuments, suppliers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { FileStack } from "lucide-react";
import UploadDrawer from "@/components/UploadDrawer";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;

  const docs = await db.select().from(procurementDocuments).where(eq(procurementDocuments.orgId, session.org.id));
  const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.orgId, session.org.id));
  const supplierName = (id: string | null) => allSuppliers.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Document Center</h1>
          <p className="text-sm text-slate-500 mt-0.5">Import and validate purchase orders, invoices, and goods-received records.</p>
        </div>
        <UploadDrawer />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {docs.length === 0 ? (
          <div className="p-12 text-center">
            <FileStack className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No documents imported yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Upload a CSV or XLSX purchase order, invoice, or goods-received note to get started, or go to
              Reconciliation Runs to process the seeded demo data.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-2.5 font-medium">File</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Supplier</th>
                <th className="px-3 py-2.5 font-medium">Extraction</th>
                <th className="px-3 py-2.5 font-medium">Validation</th>
                <th className="px-3 py-2.5 font-medium">Reconciliation</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-800">{d.fileName}</td>
                  <td className="px-3 py-3 text-slate-600 capitalize">{d.type.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 text-slate-600">{supplierName(d.supplierId)}</td>
                  <td className="px-3 py-3 text-slate-500 capitalize">{d.extractionStatus}</td>
                  <td className="px-3 py-3 text-slate-500 capitalize">{d.validationStatus}</td>
                  <td className="px-3 py-3 text-slate-500 capitalize">{d.reconciliationStatus.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
