import { useEffect, useMemo, useState } from "react";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, TrendingUp, ShoppingBag, Clock, XCircle, Trophy, BarChart3 } from "lucide-react";
import { PLATFORM_RULES } from "@/lib/platform-rules";

interface OrderRow {
  id: string; medication_name: string; quantity: number; status: string;
  total_amount: number; delivery_fee: number; created_at: string; updated_at: string;
}
interface DeliveryRow { order_id: string; status: string; created_at: string; updated_at: string; }

const PLATFORM_FEE = (PLATFORM_RULES as { PLATFORM_FEE_PCT?: number }).PLATFORM_FEE_PCT ?? 0.15;

export function PharmacyAnalytics() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: ord } = await firestoreClient
        .from("orders")
        .select("id, medication_name, quantity, status, total_amount, delivery_fee, created_at, updated_at")
        .eq("pharmacy_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      const orderIds = (ord ?? []).map(o => o.id);
      const { data: dels } = orderIds.length
        ? await firestoreClient.from("deliveries").select("order_id, status, created_at, updated_at").in("order_id", orderIds)
        : { data: [] as DeliveryRow[] };
      if (!alive) return;
      setOrders((ord ?? []) as OrderRow[]);
      setDeliveries((dels ?? []) as DeliveryRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - 6);
    const today = orders.filter(o => new Date(o.created_at) >= startOfDay);
    const week = orders.filter(o => new Date(o.created_at) >= startOfWeek);
    const completed = orders.filter(o => o.status === "delivered");
    const cancelled = orders.filter(o => o.status === "cancelled");
    const revenue = (rows: OrderRow[]) => rows
      .filter(o => o.status !== "cancelled")
      .reduce((s, o) => s + (Number(o.total_amount) - Number(o.total_amount) * PLATFORM_FEE - Number(o.delivery_fee || 0)), 0);

    // top sellers
    const tally = new Map<string, { name: string; qty: number; revenue: number }>();
    orders.filter(o => o.status !== "cancelled").forEach(o => {
      const cur = tally.get(o.medication_name) ?? { name: o.medication_name, qty: 0, revenue: 0 };
      cur.qty += o.quantity; cur.revenue += Number(o.total_amount);
      tally.set(o.medication_name, cur);
    });
    const top = [...tally.values()].sort((a,b) => b.qty - a.qty).slice(0, 5);

    // peak hours
    const hours = new Array(24).fill(0);
    orders.forEach(o => { hours[new Date(o.created_at).getHours()]++; });
    const peakHour = hours.indexOf(Math.max(...hours));

    // avg delivery time (order created -> delivery delivered)
    const deliveredMap = new Map(deliveries.filter(d => d.status === "delivered").map(d => [d.order_id, d]));
    const times: number[] = [];
    completed.forEach(o => {
      const d = deliveredMap.get(o.id);
      if (d) times.push((new Date(d.updated_at).getTime() - new Date(o.created_at).getTime()) / 60000);
    });
    const avgMins = times.length ? times.reduce((a,b)=>a+b,0) / times.length : 0;

    // weekly daily breakdown
    const days: { day: string; revenue: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfDay); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const rows = orders.filter(o => { const t = new Date(o.created_at); return t >= d && t < next; });
      days.push({
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        revenue: revenue(rows),
        orders: rows.length,
      });
    }

    return {
      todayCount: today.length,
      weekCount: week.length,
      todayRevenue: revenue(today),
      weekRevenue: revenue(week),
      cancellationRate: orders.length ? (cancelled.length / orders.length) * 100 : 0,
      avgMins,
      peakHour,
      top,
      days,
    };
  }, [orders, deliveries]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const maxRev = Math.max(1, ...stats.days.map(d => d.revenue));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ShoppingBag} label="Orders today" value={String(stats.todayCount)} sub={`${stats.weekCount} this week`} />
        <StatCard icon={TrendingUp} label="Revenue today" value={`R ${stats.todayRevenue.toFixed(0)}`} sub={`R ${stats.weekRevenue.toFixed(0)} 7-day`} accent="text-healthcare-green" />
        <StatCard icon={Clock} label="Avg delivery" value={stats.avgMins ? `${Math.round(stats.avgMins)} min` : "—"} sub={`Peak hour ${String(stats.peakHour).padStart(2,"0")}:00`} accent="text-healthcare-teal" />
        <StatCard icon={XCircle} label="Cancellation rate" value={`${stats.cancellationRate.toFixed(1)}%`} sub={`${orders.length} total orders`} accent="text-destructive" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="healthcare-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Last 7 days revenue</h3>
          <div className="flex items-end gap-2 h-40">
            {stats.days.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex-1 flex items-end">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-primary to-healthcare-sky transition-all"
                    style={{ height: `${Math.max(4, (d.revenue / maxRev) * 100)}%` }}
                    title={`R ${d.revenue.toFixed(0)} · ${d.orders} orders`} />
                </div>
                <span className="text-[10px] text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="healthcare-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Trophy className="h-4 w-4 text-healthcare-green" /> Top sellers</h3>
          {stats.top.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No sales yet.</p>
          ) : (
            <ul className="space-y-2">
              {stats.top.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2">
                  <span className="truncate"><span className="font-mono text-muted-foreground mr-2">#{i+1}</span>{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.qty} units · R {t.revenue.toFixed(0)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent = "text-primary" }: { icon: any; label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="healthcare-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  );
}
