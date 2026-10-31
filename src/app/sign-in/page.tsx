"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email, password, redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Incorrect email or password.");
    } else {
      router.push(params.get("callbackUrl") || "/overview");
      router.refresh();
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
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Sign in</h1>
          <p className="text-sm text-slate-500 mb-5">Access your organization's procurement dashboard.</p>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2.5 mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 text-sm border border-slate-300 rounded-md px-3 py-2" placeholder="you@company.com" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 text-sm border border-slate-300 rounded-md px-3 py-2" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-2 rounded-md mt-2">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-4 text-center">
            New organization?{" "}
            <Link href="/sign-up" className="text-indigo-600 hover:underline">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
