import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { RoleGuard } from "@/components/RoleGuard";
import { MarketplacePayment } from "@/components/MarketplacePayment";
import { Button } from "@/components/ui/button";
import { firestoreClient } from "@/lib/firestore-client";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, MapPin } from "lucide-react";

export const Route = createFileRoute("/payment")({
  validateSearch: input => z.object({ orderGroupId: z.string().optional(), medId: z.string().optional(), name: z.string().optional(), price: z.number().optional(), pharmacyId: z.string().optional(), qty: z.number().optional() }).parse(input),
  head: () => ({ meta: [{ title: "Order Payment — HealthReachCare" }, { name: "description", content: "Pay your own medication order securely through Paystack before delivery." }, { property: "og:title", content: "Order Payment — HealthReachCare" }, { property: "og:description", content: "Medication order payment and confirmation." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <RoleGuard allow="patient"><OrderPayment /></RoleGuard>,
});

function OrderPayment() {
  const { user } = useAuth();
  const { orderGroupId } = Route.useSearch();
  const [order, setOrder] = useState<{ total_amount?: number; delivery_address?: string; payment_status?: string; payment_reference?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    if (!user || !orderGroupId) { setLoading(false); return; }
    const result = await firestoreClient.from("order_groups").select("*").eq("id", orderGroupId).eq("patient_id", user.id).maybeSingle();
    setOrder(result.data);
    setError(result.error ? "This order could not be loaded. Please try again." : !result.data ? "This order is not available to your account." : "");
    setLoading(false);
  }
  useEffect(() => { void load(); }, [user?.id, orderGroupId]);
  return <section className="mx-auto w-full max-w-md space-y-5 px-5 py-8">
    <h1 className="text-2xl font-bold">Medication payment</h1>
    {loading ? <p>Loading your order…</p> : order && orderGroupId ? <>
      <p className="break-all font-mono text-xs text-muted-foreground">Order {orderGroupId}</p>
      <p className="text-xl font-semibold">R{Number(order.total_amount).toFixed(2)}</p>
      {order.delivery_address && <p className="flex gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0" />{order.delivery_address}</p>}
      <MarketplacePayment kind="medication" targetId={orderGroupId} paid={order.payment_status === "paid"} reference={order.payment_reference} onPaid={() => void load()} />
      {order.payment_status === "paid" && <Button asChild><Link to="/track"><CheckCircle2 className="h-4 w-4" />View delivery</Link></Button>}
    </> : <p className="text-sm text-muted-foreground">{error || "Choose real medicines from a pharmacy and review your cart before paying."}</p>}
    <Button asChild variant="outline"><Link to={orderGroupId ? "/dashboard/patient/orders" : "/dashboard/patient/medications"}>{orderGroupId ? "Back to orders" : "Browse medicines"}</Link></Button>
  </section>;
}
