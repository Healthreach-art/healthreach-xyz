import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarDays, Loader2, MessageSquare, Megaphone } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/patient/notifications")({
  head: () => ({ meta: [{ title: "Notifications — HealthReachCare" }] }),
  component: () => <RoleGuard allow="patient"><NotificationsPage /></RoleGuard>,
});

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href: string;
  kind: "notification" | "message";
  category: string;
}

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    const [notificationsResult, appointmentMessagesResult, orderMessagesResult] = await Promise.all([
      firestoreClient.from("notifications")
        .select("id, category, title, body, created_at, read_at, link")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      firestoreClient.from("appointment_messages")
        .select("id, appointment_id, body, created_at, read_at, sender_role")
        .eq("patient_id", user.id)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      firestoreClient.from("order_messages")
        .select("id, order_id, body, created_at, read_at, sender_role")
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (notificationsResult.error) toast.error(`Could not load notifications: ${notificationsResult.error.message}`);
    if (appointmentMessagesResult.error) toast.error(`Could not load appointment messages: ${appointmentMessagesResult.error.message}`);
    if (orderMessagesResult.error) toast.error(`Could not load order messages: ${orderMessagesResult.error.message}`);

    const notifications: NotificationItem[] = (notificationsResult.data ?? []).map((notification) => ({
      id: `notification-${notification.id}`,
      title: notification.title,
      body: notification.body,
      createdAt: notification.created_at,
      read: notification.read_at !== null,
      href: notification.link || "/dashboard/patient",
      kind: "notification",
      category: notification.category,
    }));
    const appointmentMessages: NotificationItem[] = (appointmentMessagesResult.data ?? []).map((message) => ({
      id: `appointment-message-${message.id}`,
      title: `New message from ${message.sender_role === "doctor" ? "your doctor" : message.sender_role === "pharmacy" ? "your pharmacy" : "your care team"}`,
      body: message.body,
      createdAt: message.created_at,
      read: message.read_at !== null,
      href: "/dashboard/patient/consultations",
      kind: "message",
      category: "message",
    }));
    const orderMessages: NotificationItem[] = (orderMessagesResult.data ?? []).map((message) => ({
      id: `order-message-${message.id}`,
      title: `New message from ${message.sender_role === "driver" ? "your driver" : message.sender_role === "pharmacy" ? "your pharmacy" : "your delivery team"}`,
      body: message.body,
      createdAt: message.created_at,
      read: message.read_at !== null,
      href: "/dashboard/patient/orders",
      kind: "message",
      category: "message",
    }));
    setItems([...notifications, ...appointmentMessages, ...orderMessages]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (cancelled) return;
      await load();
    };
    void refresh();
    if (!user?.id) return () => { cancelled = true; };
    const channel = firestoreClient.channel(`patient-notification-inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointment_messages", filter: `patient_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_messages" }, refresh)
      .subscribe();
    return () => {
      cancelled = true;
      void firestoreClient.removeChannel(channel);
    };
  }, [user?.id, load]);

  const markRead = async (notificationId: string) => {
    const { error } = await firestoreClient.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", user?.id);
    if (error) {
      toast.error(`Could not mark notification as read: ${error.message}`);
      return;
    }
    setItems((current) => current.map((item) =>
      item.id === `notification-${notificationId}` ? { ...item, read: true } : item));
  };

  return (
    <div className="container-narrow space-y-6 px-4 py-8 pb-28 sm:px-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
          <Bell className="h-6 w-6 text-primary" /> Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Messages, care updates, and announcements in one place.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length ? (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = item.kind === "message" ? MessageSquare : item.category === "promotion" ? Megaphone : Bell;
            return (
              <article key={item.id} className={`flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm ${item.read ? "" : "border-l-4 border-l-primary"}`}>
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(item.createdAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <Link
                    to={item.href as never}
                    onClick={() => item.kind === "notification" && !item.read && void markRead(item.id.replace("notification-", ""))}
                    className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline"
                  >
                    {item.kind === "message" ? "Open Messages" : "View update"}
                  </Link>
                </div>
                {!item.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">You&apos;re all caught up</h2>
          <p className="mt-1 text-sm text-muted-foreground">New messages and care updates will appear here.</p>
        </div>
      )}
    </div>
  );
}
