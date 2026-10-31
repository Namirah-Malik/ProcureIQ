"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      title="Sign out"
      className="text-slate-400 hover:text-slate-700 shrink-0"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
