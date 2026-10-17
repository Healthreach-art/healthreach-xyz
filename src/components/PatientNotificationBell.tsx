import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { firestoreClient } from "@/lib/firestore-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface PatientNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  link: string | null;
  created_at: unknown;
  read_at: string | null;
  read?: boolean | null;
}

function isUnread(notification: PatientNotification) {
  return notification.read !== true && notification.read_at == null;
}

function notificationDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    try {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  return null;
}

function safeInternalLink(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : null;
}

export function PatientNotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<PatientNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);

  const loadNotifications = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    const { data, error } = await firestoreClient.from("notifications")
      .select("id, title, body, category, link, created_at, read_at, read")
      .eq("user_id", user.id);
    if (currentRequest !== requestId.current) return;
    if (error) {
      console.error("[patient-notifications] Could not load notifications.", error);
      setLoadError(true);
      setLoading(false);
      return;
    }
    const sorted = ((data ?? []) as PatientNotification[])
      .sort((a, b) => (notificationDate(b.created_at)?.getTime() ?? 0) - (notificationDate(a.created_at)?.getTime() ?? 0));
    setNotifications(sorted);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadNotifications();
    if (!user?.id) return;
    const channel = firestoreClient.channel(`patient-notification-bell-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => void loadNotifications())
      .subscribe();
    return () => {
      requestId.current += 1;
      void firestoreClient.removeChannel(channel);
    };
  }, [loadNotifications, user?.id]);

  const unreadCount = useMemo(() => notifications.filter(isUnread).length, [notifications]);

  const openNotification = async (notification: PatientNotification) => {
    if (isUnread(notification) && user?.id) {
      const { error } = await firestoreClient.from("notifications")
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("user_id", user.id);
      if (error) {
        console.error("[patient-notifications] Could not mark notification as read.", error);
        toast.error("Could not mark this notification as read.");
        return;
      }
      setNotifications((current) => current.map((item) => item.id === notification.id
        ? { ...item, read: true, read_at: new Date().toISOString() }
        : item));
    }

    const link = safeInternalLink(notification.link);
    if (link) {
      setOpen(false);
      window.location.assign(link);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
        className="relative rounded-full"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-card">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : loadError ? (
              <div role="alert" className="py-8 text-center">
                <p className="text-sm text-muted-foreground">We couldn’t load your notifications.</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadNotifications()}>Try again</Button>
              </div>
            ) : notifications.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">You don’t have any notifications yet.</p>
            ) : notifications.map((notification) => {
              const date = notificationDate(notification.created_at);
              const link = safeInternalLink(notification.link);
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/70 ${isUnread(notification) ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isUnread(notification) ? "bg-primary" : "bg-transparent"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-foreground">{notification.title || "Notification"}</span>
                    {notification.body && <span className="mt-1 block break-words text-sm text-muted-foreground">{notification.body}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {date ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Date unavailable"}
                    </span>
                  </span>
                  {link && <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Opens related page" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
