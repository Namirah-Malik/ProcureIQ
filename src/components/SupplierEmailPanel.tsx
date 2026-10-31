"use client";

import { useState } from "react";
import { Mail, Loader2, AlertCircle, Copy, Check } from "lucide-react";

type Draft = { communicationId: string; subject: string; body: string; recipientEmail: string | null };

export default function SupplierEmailPanel({ exceptionId }: { exceptionId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recordedSent, setRecordedSent] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exceptions/${exceptionId}/draft-email`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not draft email");
      else {
        setDraft(data);
        setRecipient(data.recipientEmail ?? "");
        setRecordedSent(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copyBody() {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function recordSent() {
    if (!draft) return;
    await fetch(`/api/communications/${draft.communicationId}/record-sent`, { method: "POST" });
    setRecordedSent(true);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <Mail className="h-4 w-4 text-indigo-500" /> Supplier communication
        </h2>
        <button onClick={generate} disabled={loading} className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md flex items-center gap-1.5">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {loading ? "Drafting..." : draft ? "Regenerate draft" : "Draft clarification email"}
        </button>
      </div>
      <div className="p-5">
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mb-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}
        {!draft && !loading && !error && (
          <p className="text-sm text-slate-400">No draft yet. The draft will use only verified data already on this case and will never invent facts or a recipient address.</p>
        )}
        {draft && (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs text-slate-500">To</label>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter supplier contact email (none on file)"
                className="w-full mt-1 border border-slate-300 rounded-md px-2 py-1.5"
              />
              {!draft.recipientEmail && <p className="text-[11px] text-amber-600 mt-1">No contact email on file for this supplier — enter one manually.</p>}
            </div>
            <div>
              <label className="text-xs text-slate-500">Subject</label>
              <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="w-full mt-1 border border-slate-300 rounded-md px-2 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Body</label>
              <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={8} className="w-full mt-1 border border-slate-300 rounded-md px-2 py-1.5" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={copyBody} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md flex items-center gap-1.5">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={recordSent}
                disabled={recordedSent}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md"
              >
                {recordedSent ? "Recorded as sent" : "I sent this manually — record it"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">No email-sending integration is connected. This only records that you sent it yourself.</p>
          </div>
        )}
      </div>
    </div>
  );
}
