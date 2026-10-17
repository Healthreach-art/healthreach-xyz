import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, ClipboardList, MessageSquare, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { toast } from "sonner";

const ITEMS = [
  { to: "/dashboard/patient", label: "Home", icon: Home, exact: true },
  { to: "/dashboard/patient/activity", label: "Activity", icon: ClipboardList, exact: false },
  { to: "/dashboard/patient/consultations", label: "Messages", icon: MessageSquare, exact: false },
  { to: "/dashboard/patient/account", label: "Account", icon: UserRound, exact: false },
] as const;

export function PatientBottomNav() {
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const path = useRouterState({ select: (r) => r.location.pathname }).replace(/\/$/, "");

  useEffect(() => {
    if (!user?.id) {
      setUnreadMessages(0);
      return;
    }

    let cancelled = false;
    const loadUnreadMessages = async () => {
      const { data, error } = await firestoreClient.from("appointment_messages")
        .select("id, sender_id, read_at")
        .eq("patient_id", user.id);
      if (cancelled) return;
      if (error) {
        console.error("[patient-nav] Could not load unread messages.", error);
        toast.error("Could not refresh your unread message count.");
        return;
      }
      setUnreadMessages((data ?? []).filter((message) =>
        message.sender_id !== user.id && message.read_at == null,
      ).length);
    };

    void loadUnreadMessages();
    const channel = firestoreClient.channel(`patient-nav-messages-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "appointment_messages",
        filter: `patient_id=eq.${user.id}`,
      }, loadUnreadMessages)
      .subscribe();
    return () => {
      cancelled = true;
      void firestoreClient.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
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
                  {it.label === "Messages" && unreadMessages > 0 && (
                    <span
                      aria-label={`${unreadMessages} unread messages`}
                      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white"
                    >
                      {unreadMessages > 9 ? "9+" : unreadMessages}
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
