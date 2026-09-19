import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, HomeIcon } from "lucide-react";
import { ASSIGNMENT_LABEL } from "@/lib/homecare";

export const Route = createFileRoute("/dashboard/homecare_staff")({
  head: () => ({
    meta: [
      { title: "My Home Care Schedule — HEALTHREACH" },
      { name: "description", content: "See the home care visits assigned to you and your schedule on HEALTHREACH." },
      { property: "og:title", content: "My Home Care Schedule — HEALTHREACH" },
      { property: "og:description", content: "See the home care visits assigned to you and your schedule." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGuard allow="homecare_staff"><StaffPage /></RoleGuard>,
});

function StaffPage() {
  const { user } = useAuth();
  const [staffRow, setStaffRow] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: s } = await supabase.from("homecare_staff").select("*").eq("user_id", user.id).maybeSingle();
    setStaffRow(s);
    if (s) {
      const { data } = await supabase
        .from("homecare_assignments").select("*, homecare_requests(service_type, description, address, preferred_at)")
        .eq("staff_id", s.id).order("created_at", { ascending: false });
      setAssignments(data ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HomeIcon className="h-6 w-6 text-primary" /> My schedule</h1>
        <p className="text-sm text-muted-foreground">{staffRow ? `${staffRow.full_name}${staffRow.job_title ? ` · ${staffRow.job_title}` : ""}` : "Your staff profile is not linked yet."}</p>
      </div>

      {!staffRow && (
        <div className="healthcare-card p-6 text-sm">
          Your employer has not linked this email address to their home care company yet. Ask them to add you with the exact email you signed up with.
        </div>
      )}

      {staffRow && assignments.length === 0 && (
        <div className="healthcare-card p-6 text-center text-sm text-muted-foreground">No visits assigned to you yet.</div>
      )}

      {assignments.map((a) => (
        <div key={a.id} className="healthcare-card p-4 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold">{a.homecare_requests?.service_type ?? "Home care visit"}</p>
            <Badge variant="secondary">{ASSIGNMENT_LABEL[a.status] ?? a.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{a.homecare_requests?.address}</p>
          {a.scheduled_at && <p className="text-xs text-muted-foreground">Scheduled: {new Date(a.scheduled_at).toLocaleString()}</p>}
          {a.homecare_requests?.description && <p className="text-sm">{a.homecare_requests.description}</p>}
        </div>
      ))}
    </div>
  );
}
