import { useAuth } from "@/hooks/useAuth";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";

/** Mounts the realtime notification listener for the current user. */
export function NotificationCenter() {
  const { user } = useAuth();
  useNotificationCenter(user?.id ?? null);
  return null;
}
