import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { PharmacyAppointments } from "@/components/PharmacyAppointments";
import { PharmacyBookingSettings } from "@/components/PharmacyBookingSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/pharmacy/appointments")({
  head: () => ({ meta: [{ title: "Appointments — HealthReachCare" }] }),
  component: () => (
    <RoleGuard allow="pharmacy">
      <AppointmentsPage />
    </RoleGuard>
  ),
});

function AppointmentsPage() {
  const { user } = useAuth();

  // 🔔 Ringtone (5s) + toast + browser notification when a new appointment arrives.
  useEffect(() => {
    if (!user) return;
    const ch = firestoreClient
      .channel(`pharmacy-appt-ring-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pharmacy_appointments", filter: `pharmacy_id=eq.${user.id}` },
        (payload) => {
          const a = payload.new as { reason?: string; preferred_at?: string };
          toast.success("📅 New appointment request", {
            description: `${a?.reason || "Patient booked an appointment"}${
              a?.preferred_at ? ` — ${new Date(a.preferred_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}` : ""
            }`,
            duration: 15_000,
          });
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("New appointment request", {
                body: a?.reason || "Patient booked an appointment",
                icon: "/favicon.ico",
              });
            } catch {
              /* noop */
            }
          }
          // Ring like a phone for ~5 seconds.
          try {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new AudioCtx();
            const start = ctx.currentTime;
            const stop = start + 5;
            let t = start;
            while (t < stop) {
              [880, 660].forEach((freq) => {
                if (t >= stop) return;
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = "sine";
                o.frequency.value = freq;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
                o.connect(g);
                g.connect(ctx.destination);
                o.start(t);
                o.stop(t + 0.42);
                t += 0.5;
              });
              t += 0.2;
            }
            setTimeout(() => ctx.close().catch(() => {}), 5600);
          } catch {
            /* audio may be blocked until user interaction */
          }
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try {
              navigator.vibrate([400, 200, 400, 200, 400, 200, 400, 200, 400]);
            } catch {
              /* noop */
            }
          }
        },
      )
      .subscribe();

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    return () => {
      firestoreClient.removeChannel(ch);
    };
  }, [user]);

  return (
    <div className="container-narrow px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
        <p className="text-sm text-muted-foreground">Manage patient bookings and configure how they can book you.</p>
      </div>
      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="setup">Booking setup</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <PharmacyAppointments />
        </TabsContent>
        <TabsContent value="setup" className="mt-4">
          <PharmacyBookingSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
