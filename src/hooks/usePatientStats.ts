import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PatientStats {
  totalOrders: number;
  activeOrders: number;
  pendingDelivery: number;
  totalSpent: number;
}

export function usePatientStats() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<PatientStats>({
    totalOrders: 0, activeOrders: 0, pendingDelivery: 0, totalSpent: 0,
  });

  useEffect(() => {
    if (!user || role !== "patient") return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("status,total_amount")
        .eq("patient_id", user!.id);
      if (cancelled || !data) return;
      const totalOrders = data.length;
      const activeOrders = data.filter((o: any) => !["delivered", "cancelled"].includes(o.status)).length;
      const pendingDelivery = data.filter((o: any) => ["accepted", "preparing", "ready", "out_for_delivery"].includes(o.status)).length;
      const totalSpent = data
        .filter((o: any) => o.status !== "cancelled")
        .reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
      setStats({ totalOrders, activeOrders, pendingDelivery, totalSpent });
    }
    load();
    const ch = supabase
      .channel(`patient-stats-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `patient_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user, role]);

  return stats;
}
