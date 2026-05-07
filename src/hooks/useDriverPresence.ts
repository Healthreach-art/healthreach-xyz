import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type Status = "online" | "offline" | "break";

/** Heartbeat presence + auto-offline on browser network drop. */
export function useDriverPresence(driverId: string | null, status: Status) {
  useEffect(() => {
    if (!driverId) return;

    let cancelled = false;
    async function ping(s: Status) {
      if (cancelled) return;
      await supabase
        .from("driver_status")
        .upsert({ driver_id: driverId, status: s, last_ping_at: new Date().toISOString() } as never, { onConflict: "driver_id" });
    }
    ping(status);
    const interval = setInterval(() => ping(status), 30_000);

    function onOffline() { ping("offline"); }
    function onOnline() { ping(status); }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [driverId, status]);
}
