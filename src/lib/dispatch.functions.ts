import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TIERS = [10, 20, 30, 45, 60] as const;
const MAX_RADIUS_KM = 60;

const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuidLoose = z.string().regex(UUID_LOOSE, "Invalid UUID");

const placeOrderSchema = z.object({
  items: z.array(z.object({
    medicationId: uuidLoose,
    medicationName: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    pharmacyIdHint: uuidLoose.optional(),
  })).min(1).max(20),
  delivery: z.object({
    address: z.string().min(3).max(500),
    lat: z.number(),
    lng: z.number(),
  }),
  notes: z.string().max(500).optional(),
  priority: z.boolean().optional(),
  scheduledFor: z.string().datetime().optional(),
  recipient: z.object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().min(3).max(40).optional(),
    familyMemberId: uuidLoose.optional(),
  }).optional(),
});


function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
    const medIds = Array.from(new Set(data.items.map((i) => i.medicationId)));

    // 1. Pick ONE pharmacy: prefer the closest that stocks ALL meds within 60 km.
    //    Otherwise fall back to the closest pharmacy (per product decision).
    let chosenPharmacyId: string | null = null;
    let chosenKm = 5;

    const { data: matchRows } = await supabaseAdmin.rpc("find_pharmacy_with_all_meds", {
      _med_ids: medIds, _lat: data.delivery.lat, _lng: data.delivery.lng, _max_km: MAX_RADIUS_KM,
    });
    const matches = (matchRows ?? []) as Array<{ pharmacy_id: string; distance_km: number; has_all: boolean; match_count: number }>;
    if (matches.length > 0) {
      chosenPharmacyId = matches[0].pharmacy_id;
      chosenKm = Number(matches[0].distance_km.toFixed(2));
    } else {
      const { data: nearby } = await supabaseAdmin.rpc("find_pharmacies_near", {
        _lat: data.delivery.lat, _lng: data.delivery.lng, _max_km: MAX_RADIUS_KM,
      });
      const list = (nearby ?? []) as Array<{ pharmacy_id: string; distance_km: number }>;
      if (list.length > 0) {
        chosenPharmacyId = list[0].pharmacy_id;
        chosenKm = Number(list[0].distance_km.toFixed(2));
      }
    }

    if (!chosenPharmacyId) {
      return { orders: [], group: null, matched: false, reason: "no_pharmacy_in_range" };
    }

    const { data: pharmacy } = await supabaseAdmin
      .from("profiles")
      .select("latitude, longitude")
      .eq("user_id", chosenPharmacyId)
      .maybeSingle();

    const isScheduled = !!data.scheduledFor;

    // 2. One group = one cart = one delivery code = one package
    const { data: group, error: groupErr } = await supabaseAdmin
      .from("order_groups")
      .insert({
        patient_id: userId,
        pharmacy_id: chosenPharmacyId,
        status: isScheduled ? "scheduled" : "pending",
        delivery_address: data.delivery.address,
        delivery_lat: data.delivery.lat,
        delivery_lng: data.delivery.lng,
        pickup_lat: pharmacy?.latitude ?? null,
        pickup_lng: pharmacy?.longitude ?? null,
        delivery_km: chosenKm,
        priority: !!data.priority,
        scheduled_for: data.scheduledFor ?? null,
        notes: data.notes ?? "",
        recipient_name: data.recipient?.name ?? null,
        recipient_phone: data.recipient?.phone ?? null,
        recipient_family_member_id: data.recipient?.familyMemberId ?? null,
      } as never)
      .select("id, delivery_code")
      .single();

    if (groupErr || !group) {
      console.error("Group insert failed:", groupErr);
      return { orders: [], group: null, matched: false, reason: "group_failed" };
    }

    // 3. One order row per medicine, all sharing the group
    const created: Array<{ orderId: string; matched: boolean }> = [];
    let subtotalSum = 0;
    let deliveryFeeFirst = 0;

    for (const item of data.items) {
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .insert({
          patient_id: userId,
          pharmacy_id: chosenPharmacyId,
          order_group_id: (group as { id: string }).id,
          medication_id: item.medicationId,
          medication_name: item.medicationName,
          quantity: item.quantity,
          delivery_fee: 0,
          total_amount: 0,
          delivery_km: chosenKm,
          priority: !!data.priority,
          scheduled_for: data.scheduledFor ?? null,
          status: isScheduled ? "scheduled" : "pending",
          delivery_address: data.delivery.address,
          delivery_lat: data.delivery.lat,
          delivery_lng: data.delivery.lng,
          pickup_lat: pharmacy?.latitude ?? null,
          pickup_lng: pharmacy?.longitude ?? null,
          assignment_radius_km: 10,
          notes: data.notes ?? "",
          recipient_name: data.recipient?.name ?? null,
          recipient_phone: data.recipient?.phone ?? null,
          recipient_family_member_id: data.recipient?.familyMemberId ?? null,
        } as never)
        .select("id, total_amount, delivery_fee")
        .single();

      if (orderErr || !order) {
        console.error("Order insert failed:", orderErr);
        continue;
      }
      const row = order as { id: string; total_amount: number; delivery_fee: number };
      subtotalSum += Number(row.total_amount) - Number(row.delivery_fee);
      deliveryFeeFirst = Number(row.delivery_fee);
      created.push({ orderId: row.id, matched: true });
    }

    // 4. Roll totals onto the group (one delivery fee per package, not per item)
    const groupTotal = Math.round((subtotalSum + deliveryFeeFirst) * 100) / 100;
    await supabaseAdmin
      .from("order_groups")
      .update({
        subtotal: Math.round(subtotalSum * 100) / 100,
        delivery_fee: deliveryFeeFirst,
        total_amount: groupTotal,
      } as never)
      .eq("id", (group as { id: string }).id);

    // 5. ONE notification per package
    const itemCount = data.items.length;
    await supabaseAdmin.from("notifications").insert({
      user_id: chosenPharmacyId,
      category: "order",
      title: isScheduled
        ? "Scheduled order received"
        : data.priority ? "🚨 PRIORITY new order" : "New patient order",
      body: `${itemCount} item${itemCount > 1 ? "s" : ""} · code ${(group as { delivery_code: string }).delivery_code}${
        isScheduled ? ` · deliver by ${new Date(data.scheduledFor!).toLocaleString()}` : ""
      }`,
      link: "/dashboard/pharmacy#orders-section",
    });

    return {
      orders: created,
      group: { id: (group as { id: string }).id, deliveryCode: (group as { delivery_code: string }).delivery_code },
      matched: true,
    };
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

/**
 * Writes the verified address+coords to the signed-in user's profile right
 * after signup. Also seeds driver_locations for drivers so they appear on the
 * live map immediately.
 */
export const setSignupLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    address: z.string().min(3).max(500),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    organizationName: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const patch: Record<string, unknown> = {
      address: data.address,
      latitude: data.lat,
      longitude: data.lng,
    };
    if (data.organizationName) patch.organization_name = data.organizationName;
    if (data.phone) patch.phone = data.phone;
    await supabaseAdmin
      .from("profiles")
      .upsert({ user_id: userId, ...patch } as never, { onConflict: "user_id" });

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role === "driver") {
      await supabaseAdmin.from("driver_locations").upsert({
        driver_id: userId, lat: data.lat, lng: data.lng,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: "driver_id" });
    }
    return { ok: true };
  });
