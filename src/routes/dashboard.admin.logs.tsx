import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, FileText, Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/logs")({
  head: () => ({ meta: [{ title: "Admin Logs — HealthReachCare" }] }),
  component: () => <RoleGuard allow="admin"><AdminLogsPage /></RoleGuard>,
});

interface LogRow {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

function AdminLogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_audit_log" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error) setRows((data ?? []) as unknown as LogRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("admin-logs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_audit_log" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);

  const filtered = rows.filter((r) => {
    if (actionFilter !== "all" && r.action !== actionFilter) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      r.admin_email?.toLowerCase().includes(needle) ||
      r.action.toLowerCase().includes(needle) ||
      r.target_id?.toLowerCase().includes(needle) ||
      JSON.stringify(r.payload).toLowerCase().includes(needle)
    );
  });

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <Link to="/dashboard/admin" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to admin
          </Link>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Admin Logs</h1>
          <p className="text-sm text-muted-foreground">Audit trail of every admin action.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      <div className="healthcare-card p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by admin, action, or target…" className="pl-8" />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All actions ({rows.length})</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="healthcare-card p-6">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No log entries match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">When</th>
                <th className="pb-2">Admin</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Target</th>
                <th className="pb-2">Details</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="py-2 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2">{r.admin_email || r.admin_id?.slice(0, 8) || "—"}</td>
                    <td className="py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">{r.action}</span></td>
                    <td className="py-2 font-mono text-xs">{r.target_type ? `${r.target_type}:${r.target_id?.slice(0, 8) || "—"}` : "—"}</td>
                    <td className="py-2 text-xs text-muted-foreground max-w-md truncate">
                      {Object.keys(r.payload ?? {}).length > 0 ? JSON.stringify(r.payload) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
