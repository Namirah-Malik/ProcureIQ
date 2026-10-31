"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import type { Explanation } from "@/domain/ai-explain";

export default function AiExplainPanel({ exceptionId, initial }: { exceptionId: string; initial: Explanation | null }) {
  const [explanation, setExplanation] = useState<Explanation | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exceptions/${exceptionId}/ai-explain`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "AI analysis failed");
      } else {
        setExplanation(data.explanation);
      }
    } catch (e) {
      setError("Network error while requesting AI analysis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          AI investigation assistant
        </h2>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md flex items-center gap-1.5"
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {loading ? "Analyzing..." : explanation ? "Re-run analysis" : "Explain this discrepancy"}
        </button>
      </div>
      <div className="p-5">
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mb-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!explanation && !loading && !error && (
          <p className="text-sm text-slate-400">
            No analysis yet. The assistant only uses verified data already shown on this page — it does not invent facts or make the final decision.
          </p>
        )}
        {explanation && (
          <div className="space-y-4 text-sm">
            <Section title="Verified facts" items={explanation.verifiedFacts} tone="slate" />
            <Section title="Calculated values" items={explanation.calculatedValues} tone="slate" />
            <Section title="Possible explanations" items={explanation.possibleExplanations} tone="amber" />
            <Section title="Missing information" items={explanation.missingInformation} tone="red" />
            <Section title="Recommended next steps (suggestions, not decisions)" items={explanation.recommendedActions} tone="indigo" />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone: "slate" | "amber" | "red" | "indigo" }) {
  if (!items || items.length === 0) return null;
  const dot: Record<string, string> = { slate: "bg-slate-400", amber: "bg-amber-500", red: "bg-red-500", indigo: "bg-indigo-500" };
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{title}</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-slate-700">
            <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${dot[tone]}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
