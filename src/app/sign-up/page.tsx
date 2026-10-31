"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ orgName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create account");
        setLoading(false);
        return;
      }
      const signInRes = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      setLoading(false);
      if (signInRes?.error) {
        router.push("/sign-in");
      } else {
        router.push("/overview");
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="h-8 w-8 rounded-md bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold">PQ</div>
          <span className="font-semibold text-slate-900 text-lg">ProcureIQ</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Create your organization</h1>
          <p className="text-sm text-slate-500 mb-5">Sets up a new, private workspace. You'll be the first admin.</p>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2.5 mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Organization name</label>
              <input required value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                className="w-full mt-1 text-sm border border-slate-300 rounded-md px-3 py-2" placeholder="Acme Manufacturing" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Your name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 text-sm border border-slate-300 rounded-md px-3 py-2" placeholder="Jane Doe" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Work email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full mt-1 text-sm border border-slate-300 rounded-md px-3 py-2" placeholder="you@company.com" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Password</label>
              <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full mt-1 text-sm border border-slate-300 rounded-md px-3 py-2" placeholder="At least 8 characters" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-2 rounded-md mt-2">
              {loading ? "Creating..." : "Create organization"}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-4 text-center">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-indigo-600 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
