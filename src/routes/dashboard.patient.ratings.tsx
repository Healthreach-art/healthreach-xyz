import { ArrowLeft,  createFileRoute } from "@tanstack/react-router";
import { ArrowLeft,  RoleGuard } from "@/components/RoleGuard";
import { ArrowLeft,  useEffect, useState } from "react";
import { ArrowLeft,  useAuth } from "@/hooks/useAuth";
import { ArrowLeft,  supabase } from "@/integrations/supabase/client";
import { ArrowLeft,  Star, Loader2, Trash2, Pencil, Save, X } from "lucide-react";
import { ArrowLeft,  Button } from "@/components/ui/button";
import { ArrowLeft,  toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/ratings")({
  head: () => ({ meta: [{ title: "My Ratings — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><Page /></RoleGuard>,
});

interface RatingRow {
  id: string;
  target_id: string;
  target_type: string;
  stars: number;
  comment: string | null;
  created_at: string;
  order_id: string | null;
  appointment_id: string | null;
}

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStars, setEditStars] = useState(5);
  const [editComment, setEditComment] = useState("");

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("ratings").select("*").eq("patient_id", user.id).order("created_at", { ascending: false });
    const list = (data ?? []) as RatingRow[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.target_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, organization_name").in("user_id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p.organization_name || p.full_name || "Provider"; });
      setNames(map);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [user]);

  function startEdit(r: RatingRow) {
    setEditId(r.id); setEditStars(r.stars); setEditComment(r.comment ?? "");
  }

  async function saveEdit(id: string) {
    const { error } = await supabase.from("ratings").update({ stars: editStars, comment: editComment }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rating updated"); setEditId(null); load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this rating? You can submit a new one later.")) return;
    const { error } = await supabase.from("ratings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rating removed"); load();
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <Link to="/dashboard/patient" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Star className="h-6 w-6 text-amber-500" /> My Ratings</h1>
        <p className="text-sm text-muted-foreground">One rating per completed service. You can edit or remove your past ratings here.</p>
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          You haven't rated any services yet. After a delivery or appointment completes you'll be invited to rate it.
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  <span className="capitalize">{r.target_type}</span>: {names[r.target_id] ?? "Provider"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {r.order_id ? `Order ${r.order_id.slice(0,8)}` : r.appointment_id ? `Appointment ${r.appointment_id.slice(0,8)}` : ""}
                  {" · "}{new Date(r.created_at).toLocaleDateString("en-ZA")}
                </p>
              </div>
              <div className="flex gap-1">
                {editId === r.id ? (
                  <>
                    <Button size="sm" variant="default" onClick={() => saveEdit(r.id)}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-1">
              {[1,2,3,4,5].map((n) => {
                const filled = (editId === r.id ? editStars : r.stars) >= n;
                return (
                  <button key={n} type="button" disabled={editId !== r.id}
                    onClick={() => editId === r.id && setEditStars(n)}
                    className={editId === r.id ? "cursor-pointer" : "cursor-default"}>
                    <Star className={`h-6 w-6 ${filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                  </button>
                );
              })}
            </div>
            {editId === r.id ? (
              <textarea
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                rows={3} maxLength={500}
                className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              />
            ) : (
              r.comment && <p className="mt-2 text-xs text-foreground/80 whitespace-pre-wrap">{r.comment}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
