import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, X, Pill, Stethoscope, Truck, Building2 } from "lucide-react";
import { AppointmentChatDialog } from "./AppointmentChatDialog";
import { OrderChatDialog } from "./OrderChatDialog";

type ActiveThread =
  | { kind: "order"; id: string; pharmacyId: string; pharmacyName: string; medication: string; status: string }
  | { kind: "doctor_appt"; id: string; doctorUserId: string; doctorName: string }
  | { kind: "pharmacy_appt"; id: string; pharmacyId: string; pharmacyName: string };

const ACTIVE_ORDER = new Set(["pending","accepted","preparing","ready","out_for_delivery"]);
const ACTIVE_APPT = new Set(["pending","confirmed","accepted","scheduled","in_progress"]);

/**
 * Floating "Ask a provider" launcher. Visible only when the patient has at
 * least one active appointment or order; hidden otherwise. Opens a popover
 * listing each active thread; tapping one opens the existing chat dialog.
 */
export function AskProviderFab() {
  const { user, role } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [threads, setThreads] = useState<ActiveThread[]>([]);
  const [open, setOpen] = useState(false);
  const [openChat, setOpenChat] = useState<ActiveThread | null>(null);

  useEffect(() => {
    if (!user || role !== "patient") { setThreads([]); return; }
    let cancelled = false;
    async function load() {
      const list: ActiveThread[] = [];
      const [ord, da, pa] = await Promise.all([
        supabase.from("orders").select("id, pharmacy_id, status, medication_name").eq("patient_id", user!.id).in("status", Array.from(ACTIVE_ORDER) as any),
        supabase.from("doctor_appointments").select("id, doctor_id, status").eq("patient_id", user!.id).in("status", Array.from(ACTIVE_APPT) as any),
        supabase.from("pharmacy_appointments").select("id, pharmacy_id, status").eq("patient_id", user!.id).in("status", Array.from(ACTIVE_APPT) as any),
      ]);

      const pharmIds = new Set<string>();
      (ord.data ?? []).forEach((o: any) => o.pharmacy_id && pharmIds.add(o.pharmacy_id));
      (pa.data ?? []).forEach((p: any) => p.pharmacy_id && pharmIds.add(p.pharmacy_id));
      const pharmNames: Record<string, string> = {};
      if (pharmIds.size) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name, organization_name").in("user_id", Array.from(pharmIds));
        (profs ?? []).forEach((p: any) => { pharmNames[p.user_id] = p.organization_name || p.full_name || "Pharmacy"; });
      }

      (ord.data ?? []).forEach((o: any) => {
        if (!o.pharmacy_id) return;
        list.push({ kind: "order", id: o.id, pharmacyId: o.pharmacy_id, pharmacyName: pharmNames[o.pharmacy_id] || "Pharmacy", medication: o.medication_name || "Order", status: o.status });
      });

      const docIds = (da.data ?? []).map((d: any) => d.doctor_id).filter(Boolean);
      const docs: Record<string, { user_id: string; full_name: string }> = {};
      if (docIds.length) {
        const { data: ds } = await supabase.from("doctors").select("id, user_id, full_name").in("id", docIds);
        (ds ?? []).forEach((d: any) => { if (d.user_id) docs[d.id] = { user_id: d.user_id, full_name: d.full_name }; });
      }
      (da.data ?? []).forEach((a: any) => {
        const d = docs[a.doctor_id];
        if (!d) return;
        list.push({ kind: "doctor_appt", id: a.id, doctorUserId: d.user_id, doctorName: `Dr. ${d.full_name}` });
      });
      (pa.data ?? []).forEach((a: any) => {
        if (!a.pharmacy_id) return;
        list.push({ kind: "pharmacy_appt", id: a.id, pharmacyId: a.pharmacy_id, pharmacyName: pharmNames[a.pharmacy_id] || "Pharmacy" });
      });

      if (!cancelled) setThreads(list);
    }
    load();
    const ch = supabase.channel(`ask-fab-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_appointments", filter: `patient_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_appointments", filter: `patient_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user, role]);

  // Hide on auth/landing/etc.
  if (!user || role !== "patient" || threads.length === 0) return null;
  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/auth")) return null;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {open && (
          <div className="w-80 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl p-2">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border mb-1">
              <p className="text-sm font-bold text-foreground">Ask a provider</p>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <p className="px-2 py-1 text-[11px] text-muted-foreground">Only your active orders and appointments appear here.</p>
            <div className="mt-1 space-y-1">
              {threads.map((t) => (
                <button key={`${t.kind}-${t.id}`} onClick={() => { setOpenChat(t); setOpen(false); }}
                  className="w-full text-left rounded-xl border border-border hover:bg-accent/50 px-3 py-2 flex items-start gap-2 transition">
                  <div className="h-9 w-9 rounded-lg bg-healthcare-green/15 flex items-center justify-center shrink-0">
                    {t.kind === "order" ? <Pill className="h-4 w-4 text-healthcare-green" /> :
                     t.kind === "doctor_appt" ? <Stethoscope className="h-4 w-4 text-primary" /> :
                     <Building2 className="h-4 w-4 text-healthcare-sky" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {t.kind === "order" ? t.pharmacyName : t.kind === "doctor_appt" ? t.doctorName : t.pharmacyName}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.kind === "order" ? `${t.medication} · ${t.status.replace(/_/g," ")}` :
                       t.kind === "doctor_appt" ? "Doctor appointment" : "Pharmacy appointment"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-14 w-14 rounded-full bg-healthcare-green text-white shadow-2xl flex items-center justify-center hover:opacity-90 transition relative"
          aria-label="Ask a provider"
        >
          <MessageCircle className="h-6 w-6" />
          {threads.length > 0 && !open && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {threads.length}
            </span>
          )}
        </button>
      </div>

      {openChat && user && openChat.kind === "order" && (
        <OrderChatDialog
          orderId={openChat.id}
          orderLabel={`${openChat.pharmacyName} — ${openChat.medication}`}
          onClose={() => setOpenChat(null)}
        />
      )}
      {openChat && user && openChat.kind === "doctor_appt" && (
        <AppointmentChatDialog
          open
          onClose={() => setOpenChat(null)}
          appointmentId={openChat.id}
          appointmentType="doctor"
          patientId={user.id}
          providerId={openChat.doctorUserId}
          myRole="patient"
          title={`Chat with ${openChat.doctorName}`}
          subtitle="Replies appear in real time"
        />
      )}
      {openChat && user && openChat.kind === "pharmacy_appt" && (
        <AppointmentChatDialog
          open
          onClose={() => setOpenChat(null)}
          appointmentId={openChat.id}
          appointmentType="pharmacy"
          patientId={user.id}
          providerId={openChat.pharmacyId}
          myRole="patient"
          title={`Chat with ${openChat.pharmacyName}`}
          subtitle="Replies appear in real time"
        />
      )}
    </>
  );
}
