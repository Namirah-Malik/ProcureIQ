import { db } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";

export default async function AuditLogPage() {
  const session = await getSession();
  if (!session) return <div className="p-8 text-sm text-slate-400">No organization found.</div>;

  const events = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, session.org.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);
  const allUsers = await db.select().from(users);
  const userName = (id: string | null) => allUsers.find((u) => u.id === id)?.name ?? "System";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Activity & Audit Log</h1>
      <p className="text-sm text-slate-500 mb-5">Append-only record of {events.length} events. Not editable by application users.</p>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {events.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No audit events yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-2.5 font-medium">Timestamp</th>
                <th className="px-3 py-2.5 font-medium">Actor</th>
                <th className="px-3 py-2.5 font-medium">Action</th>
                <th className="px-3 py-2.5 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-slate-500 text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-slate-600">{userName(e.actorUserId)}</td>
                  <td className="px-3 py-2.5 text-slate-800">{e.action.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{e.entityType}:{e.entityId.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
