import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Bell, Home, MessageSquare, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { toast } from "sonner";

const ITEMS = [
  { to: "/dashboard/patient", label: "Home", icon: Home, exact: true },
  { to: "/dashboard/patient/activity", label: "Activity", icon: Activity, exact: false },
  { to: "/dashboard/patient/notifications", label: "Notifications", icon: Bell, exact: false },
  { to: "/dashboard/patient/consultations", label: "Messages", icon: MessageSquare, exact: false },
  { to: "/dashboard/patient/account", label: "Account", icon: UserRound, exact: false },
] as const;

export function PatientBottomNav() {
  const { user } = useAuth();
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const path = useRouterState({ select: (r) => r.location.pathname }).replace(/\/$/, "");

  useEffect(() => {
    if (!user?.id) {
      setUnreadChats(0);
      setUnreadNotifications(0);
      return;
    }

    let cancelled = false;
    const loadUnread = async () => {
      const [appointmentResult, notificationResult] = await Promise.all([
        firestoreClient.from("appointment_messages")
          .select("appointment_id")
          .eq("patient_id", user.id)
          .neq("sender_id", user.id)
          .is("read_at", null)
          .limit(100),
        firestoreClient.from("notifications")
          .select("id")
          .eq("user_id", user.id)
          .is("read_at", null)
          .limit(100),
      ]);
      if (cancelled) return;
      if (appointmentResult.error) toast.error(`Could not load unread appointment messages: ${appointmentResult.error.message}`);
      if (notificationResult.error) toast.error(`Could not load unread notifications: ${notificationResult.error.message}`);
      const unreadMessageCount = new Set(
        (appointmentResult.data ?? []).map((message) => `appointment:${message.appointment_id}`),
      ).size;
      setUnreadChats(unreadMessageCount);
      setUnreadNotifications((notificationResult.data?.length ?? 0) + unreadMessageCount);
    };

    void loadUnread();
    const channel = firestoreClient.channel(`patient-nav-messages-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointment_messages", filter: `patient_id=eq.${user.id}` }, loadUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, loadUnread)
      .subscribe();
    return () => {
      cancelled = true;
      void firestoreClient.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {ITEMS.map((it) => {
          const active = it.exact ? path === it.to : path.startsWith(it.to);
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="relative">
                  <it.icon className={`h-6 w-6 ${active ? "stroke-[2.5]" : ""}`} />
                  {it.label === "Messages" && unreadChats > 0 && (
                    <span
                      aria-label={`${unreadChats} unread messages`}
                      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white"
                    >
                      {unreadChats > 9 ? "9+" : unreadChats}
                    </span>
                  )}
                  {it.label === "Notifications" && unreadNotifications > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white" aria-label={`${unreadNotifications} unread notifications`}>
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </span>
                  )}
                </span>
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
