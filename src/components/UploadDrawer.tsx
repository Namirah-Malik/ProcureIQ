"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

type DocType = "purchase_order" | "invoice" | "goods_receipt";
type FileStatus = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
  warnings?: string[];
};

export default function UploadDrawer() {
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<DocType>("purchase_order");
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function addFiles(fileList: FileList) {
    const next = Array.from(fileList).map((f) => ({ file: f, status: "pending" as const }));
    setFiles((prev) => [...prev, ...next]);
  }

  async function uploadAll() {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f)));
      const fd = new FormData();
      fd.append("file", files[i].file);
      fd.append("type", docType);
      try {
        const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "error", message: data.error, warnings: data.warnings } : f)));
        } else {
          setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "done", message: `${data.recordsCreated} record(s) created`, warnings: data.warnings } : f)));
        }
      } catch {
        setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "error", message: "Network error" } : f)));
      }
    }
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md flex items-center gap-1.5"
      >
        <UploadCloud className="h-4 w-4" /> Upload document
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <div className="relative w-[420px] bg-white h-full border-l border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Upload documents</h2>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="text-xs text-slate-500">Document type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocType)}
                  className="w-full mt-1 text-sm border border-slate-300 rounded-md px-2 py-1.5"
                >
                  <option value="purchase_order">Purchase order</option>
                  <option value="invoice">Vendor invoice</option>
                  <option value="goods_receipt">Goods-received note</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">CSV or XLSX, one row per line item, grouped by document number. Max 10MB.</p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <UploadCloud className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
                <p className="text-sm text-slate-600">Drag and drop, or click to select files</p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="border border-slate-200 rounded-md p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="flex-1 truncate text-slate-700">{f.file.name}</span>
                        <span className="text-xs text-slate-400">{(f.file.size / 1024).toFixed(0)} KB</span>
                        {f.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
                        {f.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {f.status === "error" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </div>
                      {f.message && (
                        <p className={`text-xs mt-1 ${f.status === "error" ? "text-red-600" : "text-slate-500"}`}>{f.message}</p>
                      )}
                      {f.warnings && f.warnings.length > 0 && (
                        <ul className="text-xs text-amber-700 mt-1 list-disc list-inside space-y-0.5">
                          {f.warnings.slice(0, 5).map((w, wi) => <li key={wi}>{w}</li>)}
                          {f.warnings.length > 5 && <li>+{f.warnings.length - 5} more</li>}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200">
              <button
                onClick={uploadAll}
                disabled={files.every((f) => f.status !== "pending")}
                className="w-full text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-2 rounded-md"
              >
                Import {files.filter((f) => f.status === "pending").length || ""} file(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
