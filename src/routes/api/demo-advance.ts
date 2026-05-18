import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const BodySchema = z.object({
  order_id: z.string().uuid(),
  step: z.enum(["preparing", "ready", "assigned", "picked_up", "in_transit", "delivered"]),
});

// Johannesburg fallback coords + small jitter so the map moves between steps.
function jhbPoint(seed: number, t: number) {
  const lat = -26.2041 + (Math.sin(seed) * 0.05) + t * 0.004;
  const lng = 28.0473 + (Math.cos(seed) * 0.05) - t * 0.003;
  return { lat, lng };
}
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/**
 * Demo-only: progress a patient's own order through its lifecycle without
 * needing a real pharmacy/driver to log in. Uses admin client so it can act
 * across roles, but verifies the caller owns the order first.
 */
export const Route = createFileRoute("/api/demo-advance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const auth = request.headers.get("authorization") || "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = claims.claims.sub as string;

        let body: z.infer<typeof BodySchema>;
        try { body = BodySchema.parse(await request.json()); }
        catch { return new Response("Invalid payload", { status: 400 }); }

        const { data: order, error: orderErr } = await supabaseAdmin
          .from("orders")
          .select("id, patient_id, pharmacy_id, delivery_address, medication_name")
          .eq("id", body.order_id)
          .maybeSingle();
        if (orderErr || !order) return new Response("Order not found", { status: 404 });
        if (order.patient_id !== userId) return new Response("Forbidden", { status: 403 });

        const seed = hashStr(order.id);

        if (body.step === "preparing" || body.step === "ready") {
          await supabaseAdmin
            .from("orders")
            .update({ status: body.step, updated_at: new Date().toISOString() })
            .eq("id", order.id);
          // The "ready" status triggers create_delivery_on_ready DB trigger.
          return Response.json({ ok: true, step: body.step });
        }

        // Steps from "assigned" onward need the delivery row.
        let { data: delivery } = await supabaseAdmin
          .from("deliveries").select("*").eq("order_id", order.id).maybeSingle();
        if (!delivery) {
          // Force-create one if pharmacy hasn't moved order to "ready" yet.
          await supabaseAdmin.from("orders").update({ status: "ready" }).eq("id", order.id);
          const ins = await supabaseAdmin.from("deliveries").insert({
            order_id: order.id, status: "assigned",
            delivery_address: order.delivery_address ?? "",
            pickup_address: "Pharmacy pickup",
            estimated_time: "20–30 min",
          }).select().single();
          delivery = ins.data;
        }
        if (!delivery) return new Response("Delivery create failed", { status: 500 });

        // Pick any driver user; if none, leave driver_id null.
        let driverId: string | null = delivery.driver_id ?? null;
        if (!driverId) {
          const { data: drv } = await supabaseAdmin
            .from("user_roles").select("user_id").eq("role", "driver").limit(1).maybeSingle();
          driverId = drv?.user_id ?? null;
        }

        if (body.step === "assigned") {
          await supabaseAdmin.from("deliveries").update({
            status: "assigned", driver_id: driverId,
            estimated_time: "15–25 min", updated_at: new Date().toISOString(),
          }).eq("id", delivery.id);
          if (driverId) {
            const p = jhbPoint(seed, 0);
            await supabaseAdmin.from("driver_locations").upsert({
              driver_id: driverId, order_id: order.id, lat: p.lat, lng: p.lng, speed: 0,
              heading: 0, updated_at: new Date().toISOString(),
            }, { onConflict: "driver_id" });
          }
          return Response.json({ ok: true, step: "assigned" });
        }

        if (body.step === "picked_up") {
          await supabaseAdmin.from("deliveries").update({
            status: "picked_up", driver_id: driverId,
            updated_at: new Date().toISOString(),
          }).eq("id", delivery.id);
          if (driverId) {
            const p = jhbPoint(seed, 1);
            await supabaseAdmin.from("driver_locations").upsert({
              driver_id: driverId, order_id: order.id, lat: p.lat, lng: p.lng, speed: 8,
              heading: 45, updated_at: new Date().toISOString(),
            }, { onConflict: "driver_id" });
          }
          return Response.json({ ok: true, step: "picked_up" });
        }

        if (body.step === "in_transit") {
          await supabaseAdmin.from("deliveries").update({
            status: "in_transit", driver_id: driverId,
            updated_at: new Date().toISOString(),
          }).eq("id", delivery.id);
          if (driverId) {
            const p = jhbPoint(seed, 2.5);
            await supabaseAdmin.from("driver_locations").upsert({
              driver_id: driverId, order_id: order.id, lat: p.lat, lng: p.lng, speed: 12,
              heading: 90, updated_at: new Date().toISOString(),
            }, { onConflict: "driver_id" });
          }
          return Response.json({ ok: true, step: "in_transit" });
        }

        if (body.step === "delivered") {
          await supabaseAdmin.from("deliveries").update({
            status: "delivered", driver_id: driverId,
            updated_at: new Date().toISOString(),
          }).eq("id", delivery.id);
          // sync_order_from_delivery trigger flips order status to delivered too.
          if (driverId) {
            const p = jhbPoint(seed, 4);
            await supabaseAdmin.from("driver_locations").upsert({
              driver_id: driverId, order_id: order.id, lat: p.lat, lng: p.lng, speed: 0,
              heading: 0, updated_at: new Date().toISOString(),
            }, { onConflict: "driver_id" });
          }
          return Response.json({ ok: true, step: "delivered" });
        }

        return new Response("Unknown step", { status: 400 });
      },
    },
  },
});
