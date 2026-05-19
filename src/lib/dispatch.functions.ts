import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TIERS = [10, 20, 30, 45, 60] as const;
const MAX_RADIUS_KM = 60;

const placeOrderSchema = z.object({
  items: z.array(z.object({
    medicationId: z.string().uuid(),
    medicationName: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    pharmacyIdHint: z.string().uuid().optional(),
  })).min(1).max(20),
  delivery: z.object({
    address: z.string().min(3).max(500),
    lat: z.number(),
    lng: z.number(),
  }),
  notes: z.string().max(500).optional(),
});

async function findNearbyPharmaciesWithMed(medName: string, lat: number, lng: number, maxKm: number, excludeIds: string[]) {
  const { data: rows } = await supabaseAdmin.rpc("find_pharmacies_near", {
    _lat: lat, _lng: lng, _max_km: maxKm,
  });
  const list = (rows ?? []) as Array<{ pharmacy_id: string; organization_name: string; distance_km: number }>;
  if (list.length === 0) return [];
  const ids = list.map((r) => r.pharmacy_id).filter((id) => !excludeIds.includes(id));
  if (ids.length === 0) return [];
  const { data: meds } = await supabaseAdmin
    .from("medications")
    .select("pharmacy_id, stock_quantity")
    .in("pharmacy_id", ids)
    .ilike("name", medName)
    .gt("stock_quantity", 0);
  const haveMed = new Set((meds ?? []).map((m) => m.pharmacy_id));
  return list.filter((r) => haveMed.has(r.pharmacy_id));
}

async function createOfferForTier(orderId: string, patientId: string, medName: string, lat: number, lng: number, currentRadius: number) {
  // Find candidates already-tried
  const { data: prior } = await supabaseAdmin
    .from("pharmacy_offers")
    .select("pharmacy_id")
    .eq("order_id", orderId);
  const tried = new Set((prior ?? []).map((p) => p.pharmacy_id));

  // Walk tiers starting at currentRadius
  for (const tier of TIERS) {
    if (tier < currentRadius) continue;
    const candidates = await findNearbyPharmaciesWithMed(medName, lat, lng, tier, Array.from(tried));
    const next = candidates[0];
    if (next) {
      await supabaseAdmin.from("pharmacy_offers").insert({
        order_id: orderId,
        pharmacy_id: next.pharmacy_id,
        patient_id: patientId,
        distance_km: Number(next.distance_km.toFixed(2)),
        tier_km: tier,
      });
      await supabaseAdmin.from("orders").update({ assignment_radius_km: tier }).eq("id", orderId);
      return { matched: true, pharmacyId: next.pharmacy_id, tier };
    }
  }
  // Exhausted
  await supabaseAdmin.from("orders").update({ status: "cancelled", notes: "No pharmacies available within 60 km" }).eq("id", orderId);
  await supabaseAdmin.from("notifications").insert({
    user_id: patientId, category: "order", title: "No pharmacies available",
    body: "We couldn't find a pharmacy with stock within 60 km. Order cancelled and refunded.",
    link: "/dashboard/patient",
  });
  return { matched: false };
}

export const placeOrderWithRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => placeOrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const created: Array<{ orderId: string; matched: boolean }> = [];

    for (const item of data.items) {
      // Compute totals from authoritative price (trigger also enforces this)
      const { data: med } = await supabaseAdmin
        .from("medications").select("price, pharmacy_id").eq("id", item.medicationId).maybeSingle();
      if (!med) continue;

      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .insert({
          patient_id: userId,
          pharmacy_id: null, // unassigned — pharmacy chosen via offers
          medication_id: item.medicationId,
          medication_name: item.medicationName,
          quantity: item.quantity,
          delivery_fee: 50,
          total_amount: 0, // trigger validate_order_pricing overrides
          status: "pending",
          delivery_address: data.delivery.address,
          delivery_lat: data.delivery.lat,
          delivery_lng: data.delivery.lng,
          assignment_radius_km: 10,
          notes: data.notes ?? "",
        })
        .select("id")
        .single();
      if (orderErr || !order) {
        console.error("Order insert failed:", orderErr);
        continue;
      }

      const result = await createOfferForTier(order.id, userId, item.medicationName, data.delivery.lat, data.delivery.lng, 10);
      created.push({ orderId: order.id, matched: result.matched });
    }

    return { orders: created };
  });

export const escalateOrderAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, patient_id, pharmacy_id, medication_name, delivery_lat, delivery_lng, assignment_radius_km, status")
      .eq("id", data.orderId).maybeSingle();
    if (!order) return { ok: false, reason: "not_found" };
    if (order.patient_id !== userId) return { ok: false, reason: "forbidden" };
    if (order.pharmacy_id) return { ok: true, already_assigned: true };
    if (order.status === "cancelled") return { ok: false, reason: "cancelled" };
    if (!order.delivery_lat || !order.delivery_lng) return { ok: false, reason: "no_coords" };

    // Mark expired any open offers past TTL
    await supabaseAdmin.from("pharmacy_offers")
      .update({ status: "expired" })
      .eq("order_id", order.id)
      .eq("status", "open")
      .lt("expires_at", new Date().toISOString());

    // If any open offer still active, nothing to do
    const { data: stillOpen } = await supabaseAdmin
      .from("pharmacy_offers").select("id")
      .eq("order_id", order.id).eq("status", "open").limit(1);
    if (stillOpen && stillOpen.length > 0) return { ok: true, waiting: true };

    // Next tier up
    const current = order.assignment_radius_km ?? 10;
    const nextTier = TIERS.find((t) => t > current) ?? current;
    if (current >= MAX_RADIUS_KM && nextTier === current) {
      // already exhausted
      const result = await createOfferForTier(order.id, order.patient_id, order.medication_name, order.delivery_lat, order.delivery_lng, current);
      return { ok: result.matched, exhausted: !result.matched };
    }
    const result = await createOfferForTier(order.id, order.patient_id, order.medication_name, order.delivery_lat, order.delivery_lng, nextTier);
    return { ok: result.matched, tier: result.matched ? (result as any).tier : null };
  });

export const setPharmacyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    address: z.string().min(3).max(500),
    lat: z.number(), lng: z.number(),
    serviceRadiusKm: z.number().int().min(5).max(60).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await supabaseAdmin.from("profiles").update({
      address: data.address,
      latitude: data.lat,
      longitude: data.lng,
      ...(data.serviceRadiusKm ? { service_radius_km: data.serviceRadiusKm } : {}),
    }).eq("user_id", context.userId);
    return { ok: true };
  });
