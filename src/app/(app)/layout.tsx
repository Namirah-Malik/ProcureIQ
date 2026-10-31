import Link from "next/link";
import {
  LayoutDashboard, FileStack, GitCompareArrows, AlertTriangle,
  Building2, ClipboardList, BarChart3, History, Settings, CircleUserRound,
} from "lucide-react";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";

const nav = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileStack },
  { href: "/reconciliation", label: "Reconciliation Runs", icon: GitCompareArrows },
  { href: "/exceptions", label: "Exceptions", icon: AlertTriangle },
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/analytics", label: "Analytics & Reports", icon: BarChart3 },
  { href: "/audit-log", label: "Activity & Audit Log", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
              PQ
            </div>
            <span className="font-semibold text-slate-900 tracking-tight">ProcureIQ</span>
          </div>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <Icon className="h-4 w-4 text-slate-500" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 px-4 py-3 flex items-center gap-2 text-sm text-slate-600">
          <CircleUserRound className="h-5 w-5 text-slate-400 shrink-0" />
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="font-medium text-slate-800 truncate">{session?.user?.name ?? "—"}</span>
            <span className="text-xs text-slate-500 truncate">{session?.org?.name ?? "No organization"}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
