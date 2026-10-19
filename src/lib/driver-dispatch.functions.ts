import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";

export const DRIVER_OFFER_RADIUS_KM = 20;
const DRIVER_OFFER_BATCH = 30;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * Uber-style: returns open delivery offers whose pickup point (the pharmacy)
 * is within `maxKm` of the driver's last known live location.
 */
export const getNearbyOffersForDriver = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((i) =>
    z.object({ maxKm: z.number().min(1).max(60).default(DRIVER_OFFER_RADIUS_KM) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const [{ data: loc }, { data: profile }] = await Promise.all([
      firestoreAdmin
        .from("driver_locations")
        .select("lat, lng")
        .eq("driver_id", userId)
        .maybeSingle(),
      firestoreAdmin
        .from("profiles")
        .select("latitude, longitude")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    // Cape Town fallback keeps manual dispatch testable when a browser blocks GPS.
    const driverLat = loc?.lat ?? profile?.latitude ?? -33.9020;
    const driverLng = loc?.lng ?? profile?.longitude ?? 18.4200;

    await Promise.all([
      firestoreAdmin
        .from("driver_status")
        .upsert({ driver_id: userId, status: "online", last_ping_at: new Date().toISOString() }, { onConflict: "driver_id" }),
      firestoreAdmin
        .from("driver_locations")
        .upsert({ driver_id: userId, lat: driverLat, lng: driverLng, updated_at: new Date().toISOString() } as never, { onConflict: "driver_id" }),
    ]);

    const { data: openOffers } = await firestoreAdmin
      .from("delivery_offers")
      .select("id, order_id, pharmacy_id, message, created_at, declined_by, expires_at, status, target_driver_id, distance_km, offer_round")
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    const visible = (openOffers ?? []).filter((o) => {
      const declined = (o.declined_by as string[] | null) ?? [];
      return !declined.includes(userId) && (!o.target_driver_id || o.target_driver_id === userId);
    });
    if (visible.length === 0) return { offers: [] as Array<NearbyOffer> };

    const pharmacyIds = Array.from(new Set(visible.map((o) => o.pharmacy_id)));
    const orderIds = visible.map((o) => o.order_id);

    const [{ data: profs }, { data: dels }, { data: ords }] = await Promise.all([
      firestoreAdmin
        .from("profiles")
        .select("user_id, latitude, longitude, organization_name, full_name, address")
        .in("user_id", pharmacyIds),
      firestoreAdmin
        .from("deliveries")
        .select("order_id, pickup_address, delivery_address")
        .in("order_id", orderIds),
      firestoreAdmin
        .from("orders")
        .select("id, delivery_address, pickup_lat, pickup_lng, delivery_lat, delivery_lng, delivery_fee")
        .in("id", orderIds),
    ]);

    const profMap = new Map((profs ?? []).map((p) => [p.user_id, p]));
    const delMap = new Map((dels ?? []).map((d) => [d.order_id, d]));
    const ordMap = new Map((ords ?? []).map((o) => [o.id, o]));

    const enriched: NearbyOffer[] = [];
    for (const o of visible) {
      const ord = ordMap.get(o.order_id);
      const phar = profMap.get(o.pharmacy_id);
      const pickupLat = ord?.pickup_lat ?? phar?.latitude ?? -33.9249;
      const pickupLng = ord?.pickup_lng ?? phar?.longitude ?? 18.4241;
      const distance_km = Number(o.distance_km ?? haversineKm(driverLat, driverLng, pickupLat, pickupLng));
      if (distance_km > data.maxKm) continue;
      const del = delMap.get(o.order_id);
      enriched.push({
        id: o.id,
        order_id: o.order_id,
        message: o.message,
        created_at: o.created_at,
        declined_by: (o.declined_by as string[] | null) ?? [],
        expires_at: o.expires_at,
        pickup_address: del?.pickup_address ?? phar?.address ?? null,
        delivery_address: del?.delivery_address ?? ord?.delivery_address ?? null,
        pharmacy_name: phar?.organization_name || phar?.full_name || "Pharmacy",
        distance_km: Math.round(distance_km * 10) / 10,
        delivery_fee: Number(ord?.delivery_fee ?? 0),
        offer_round: Number(o.offer_round ?? 1),
      });
    }
    enriched.sort((a, b) => a.distance_km - b.distance_km);
    return { offers: enriched, driverLat, driverLng };
  });

export type NearbyOffer = {
  id: string;
  order_id: string;
  message: string | null;
  created_at: string;
  declined_by: string[];
  expires_at: string;
  pickup_address: string | null;
  delivery_address: string | null;
  pharmacy_name: string;
  distance_km: number;
  delivery_fee: number;
  offer_round: number;
};

async function assertPharmacyOrAdmin(userId: string, orderId?: string) {
  const { data: roles } = await firestoreAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));
  if (roleSet.has("admin")) return;
  if (!roleSet.has("pharmacy")) throw new Error("Pharmacy or admin role required");
  if (orderId) {
    const { data: ord } = await firestoreAdmin
      .from("orders")
      .select("pharmacy_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!ord || ord.pharmacy_id !== userId) throw new Error("Not authorized for this order");
  }
}

export const dispatchOrderToNearbyDrivers = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((i) => z.object({ orderId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPharmacyOrAdmin(context.userId, data.orderId);
    const { data: result, error } = await firestoreAdmin.rpc("dispatch_ready_order_to_drivers", {
      _order_id: data.orderId,
      _max_drivers: DRIVER_OFFER_BATCH,
      _radius_km: DRIVER_OFFER_RADIUS_KM,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; inserted?: number; waiting?: boolean; assigned?: boolean; round?: number; reason?: string };
  });

export const rebroadcastUnacceptedDriverOrders = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((i) => z.object({ maxOrders: z.number().int().min(1).max(50).default(25) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPharmacyOrAdmin(context.userId);
    const { data: result, error } = await firestoreAdmin.rpc("rebroadcast_unaccepted_delivery_orders", {
      _max_orders: data.maxOrders,
      _max_drivers: DRIVER_OFFER_BATCH,
      _radius_km: DRIVER_OFFER_RADIUS_KM,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; processed?: number; inserted?: number };
  });

export const acceptDeliveryOffer = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((i) => z.object({ offerId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await firestoreAdmin.rpc("accept_delivery_offer_for_driver", {
      _offer_id: data.offerId,
      _driver_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; order_id?: string };
  });

export const declineDeliveryOffer = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((i) => z.object({ offerId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await firestoreAdmin.rpc("decline_delivery_offer_for_driver", {
      _offer_id: data.offerId,
      _driver_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });
