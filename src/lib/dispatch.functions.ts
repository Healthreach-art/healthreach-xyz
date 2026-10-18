import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { customerPrice, deliveryFeeForKm } from "@/lib/pricing";
import { isMedicineExpired } from "@/lib/medicine-catalog";

const TIERS = [10, 20, 30, 45, 60] as const;
const MAX_RADIUS_KM = 60;

const UUID_LOOSE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuidLoose = z.string().regex(UUID_LOOSE, "Invalid UUID");

const placeOrderSchema = z.object({
  items: z.array(z.object({
    medicationId: uuidLoose,
    medicationName: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    pharmacyIdHint: uuidLoose,
    prescriptionUploadId: uuidLoose.nullable().optional(),
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
  const list = await findPharmaciesNear(lat, lng, maxKm);
  if (list.length === 0) return [];
  const ids = list.map((r) => r.pharmacy_id).filter((id) => !excludeIds.includes(id));
  if (ids.length === 0) return [];
  const medicationRows = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 30) }, (_, index) =>
      firestoreAdmin
        .from("medications_public")
        .select("pharmacy_id, stock_quantity, expiry_date")
        .in("pharmacy_id", ids.slice(index * 30, index * 30 + 30))
        .ilike("name", medName)
        .eq("is_active", true)
        .eq("is_demo", false)
        .gt("stock_quantity", 0),
    ),
  );
  const haveMed = new Set(
    medicationRows.flatMap(({ data, error }) => {
      if (error) throw error;
      return (data ?? [])
        .filter((medication) => !isMedicineExpired(medication.expiry_date))
        .map((medication) => medication.pharmacy_id);
    }),
  );
  return list.filter((r) => haveMed.has(r.pharmacy_id));
}

async function findPharmaciesNear(lat: number, lng: number, maxKm: number) {
  const [{ data: profiles, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
    firestoreAdmin.from("profiles")
      .select("user_id, organization_name, full_name, latitude, longitude, approval_status")
      .eq("approval_status", "approved"),
    firestoreAdmin.from("user_roles").select("user_id").eq("role", "pharmacy"),
  ]);
  if (profileError) throw profileError;
  if (roleError) throw roleError;
  const pharmacyIds = new Set((roles ?? []).map((role) => role.user_id));
  return (profiles ?? [])
    .filter((profile) =>
      pharmacyIds.has(profile.user_id)
      && profile.latitude != null
      && profile.longitude != null,
    )
    .map((profile) => ({
      pharmacy_id: profile.user_id,
      organization_name: profile.organization_name || profile.full_name || "",
      distance_km: haversineKm(lat, lng, profile.latitude!, profile.longitude!),
    }))
    .filter((pharmacy) => pharmacy.distance_km <= maxKm)
    .sort((first, second) => first.distance_km - second.distance_km);
}

async function createOfferForTier(orderId: string, patientId: string, medName: string, lat: number, lng: number, currentRadius: number) {
  // Find candidates already-tried
  const { data: prior } = await firestoreAdmin
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
      await firestoreAdmin.from("pharmacy_offers").insert({
        order_id: orderId,
        pharmacy_id: next.pharmacy_id,
        patient_id: patientId,
        distance_km: Number(next.distance_km.toFixed(2)),
        tier_km: tier,
      });
      await firestoreAdmin.from("orders").update({ assignment_radius_km: tier }).eq("id", orderId);
      return { matched: true, pharmacyId: next.pharmacy_id, tier };
    }
  }
  // Exhausted
  await firestoreAdmin.from("orders").update({ status: "cancelled", notes: "No pharmacies available within 60 km" }).eq("id", orderId);
  await firestoreAdmin.from("notifications").insert({
    user_id: patientId, category: "order", title: "No pharmacies available",
    body: "We couldn't find a pharmacy with stock within 60 km. Order cancelled and refunded.",
    link: "/dashboard/patient",
  });
  return { matched: false };
}

export const placeOrderWithRouting = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => placeOrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const medIds = Array.from(new Set(data.items.map((i) => i.medicationId)));
    const { data: publicMedications, error: medicationsError } = await firestoreAdmin
      .from("medications_public")
      .select("*")
      .in("id", medIds)
      .eq("is_active", true)
      .eq("is_demo", false)
      .gt("stock_quantity", 0);
    if (medicationsError) throw medicationsError;

    const publicMedicationIds = new Set((publicMedications ?? []).map((medication) => medication.id));
    const missingMedicationIds = medIds.filter((id) => !publicMedicationIds.has(id));
    const { data: legacyMedications, error: legacyMedicationsError } = missingMedicationIds.length > 0
      ? await firestoreAdmin
        .from("medications")
        .select("*")
        .in("id", missingMedicationIds)
        .eq("is_active", true)
        .eq("is_demo", false)
        .gt("stock_quantity", 0)
      : { data: [], error: null };
    if (legacyMedicationsError) throw legacyMedicationsError;
    const medications = [...(publicMedications ?? []), ...(legacyMedications ?? [])];
    const medicationById = new Map((medications ?? []).map((medication) => [medication.id, medication]));
    const pharmacyIds = new Set<string>();
    for (const item of data.items) {
      const medication = medicationById.get(item.medicationId);
      if (!medication || medication.pharmacy_id !== item.pharmacyIdHint) {
        throw new Error("A medicine is no longer available from the pharmacy shown. Refresh your cart and try again.");
      }
      if (!Number.isSafeInteger(Number(medication.stock_quantity)) || Number(medication.stock_quantity) < item.quantity) {
        throw new Error(`${medication.name} does not have enough stock for this order.`);
      }
      if (isMedicineExpired(medication.expiry_date)) {
        throw new Error(`${medication.name} is no longer available because its stock has expired.`);
      }
      pharmacyIds.add(String(medication.pharmacy_id));
    }
    if (pharmacyIds.size !== 1) {
      throw new Error("Order medicines from one pharmacy at a time. Remove items from another pharmacy and retry.");
    }

    const chosenPharmacyId = Array.from(pharmacyIds)[0];
    const [{ data: patientProfile, error: patientProfileError },
      { data: profile, error: profileError }, { data: pharmacy, error: pharmacyError },
      { data: role, error: roleError }, { data: branch, error: branchError }] = await Promise.all([
      firestoreAdmin.from("profiles")
        .select("full_name, phone")
        .eq("user_id", userId)
        .maybeSingle(),
      firestoreAdmin.from("profiles")
        .select("user_id, latitude, longitude, approval_status")
        .eq("user_id", chosenPharmacyId)
        .eq("approval_status", "approved")
        .maybeSingle(),
      firestoreAdmin.from("pharmacies")
        .select("user_id, status")
        .eq("user_id", chosenPharmacyId)
        .eq("status", "approved")
        .maybeSingle(),
      firestoreAdmin.from("user_roles")
        .select("user_id, role")
        .eq("user_id", chosenPharmacyId)
        .eq("role", "pharmacy")
        .maybeSingle(),
      firestoreAdmin.from("pharmacy_branches")
        .select("id, latitude, longitude")
        .eq("pharmacy_id", chosenPharmacyId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (patientProfileError) throw patientProfileError;
    if (profileError) throw profileError;
    if (pharmacyError) throw pharmacyError;
    if (roleError) throw roleError;
    if (branchError) throw branchError;
    if (!profile || !pharmacy || !role) {
      throw new Error("This pharmacy is not currently approved and accepting marketplace orders.");
    }

    const isScheduled = !!data.scheduledFor;
    const now = new Date().toISOString();
    const pickupLat = branch?.latitude ?? profile.latitude ?? null;
    const pickupLng = branch?.longitude ?? profile.longitude ?? null;
    const chosenKm = pickupLat != null && pickupLng != null
      ? Number(haversineKm(data.delivery.lat, data.delivery.lng, pickupLat, pickupLng).toFixed(2))
      : 5;
    const subtotalSum = Math.round(data.items.reduce((total, item) => {
      const medication = medicationById.get(item.medicationId)!;
      return total + customerPrice(Number(medication.price)) * item.quantity;
    }, 0) * 100) / 100;
    const deliveryFee = deliveryFeeForKm(chosenKm);
    const groupTotal = Math.round((subtotalSum + deliveryFee) * 100) / 100;

    // 2. One group = one cart = one delivery code = one package
    const { data: group, error: groupErr } = await firestoreAdmin
      .from("order_groups")
      .insert({
        patient_id: userId,
        pharmacy_id: chosenPharmacyId,
        status: isScheduled ? "scheduled" : "pending",
        delivery_address: data.delivery.address,
        delivery_lat: data.delivery.lat,
        delivery_lng: data.delivery.lng,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        delivery_km: chosenKm,
        priority: !!data.priority,
        scheduled_for: data.scheduledFor ?? null,
        notes: data.notes ?? "",
        is_demo: false,
        recipient_name: data.recipient?.name ?? patientProfile?.full_name ?? null,
        recipient_phone: data.recipient?.phone ?? patientProfile?.phone ?? null,
        recipient_family_member_id: data.recipient?.familyMemberId ?? null,
        subtotal: subtotalSum,
        delivery_fee: deliveryFee,
        total_amount: groupTotal,
        created_at: now,
        updated_at: now,
      } as never)
      .select("id, delivery_code")
      .single();

    if (groupErr || !group) {
      console.error("Group insert failed:", groupErr);
      return { orders: [], group: null, matched: false, reason: "group_failed" };
    }

    // 3. One order row per medicine, all sharing the group
    const created: Array<{ orderId: string; matched: boolean }> = [];
    for (const item of data.items) {
      const medication = medicationById.get(item.medicationId)!;
      const prescriptionUploadId = medication.requires_prescription
        ? item.prescriptionUploadId
        : null;
      if (medication.requires_prescription) {
        if (!prescriptionUploadId) {
          throw new Error(`${medication.name} requires an approved prescription.`);
        }
        const { data: upload, error: uploadError } = await firestoreAdmin
          .from("prescription_uploads")
          .select("id, patient_id, pharmacy_id, medication_id, status, expires_at, repeats_total, repeats_used, fraud_score")
          .eq("id", prescriptionUploadId)
          .maybeSingle();
        if (uploadError) throw uploadError;
        const repeatsTotal = Number(upload?.repeats_total ?? 0);
        const repeatsUsed = Number(upload?.repeats_used ?? 0);
        if (
          !upload
          || upload.patient_id !== userId
          || upload.status !== "approved"
          || upload.pharmacy_id && upload.pharmacy_id !== chosenPharmacyId
          || upload.medication_id && upload.medication_id !== medication.id
          || upload.expires_at && new Date(upload.expires_at).getTime() <= Date.now()
          || Number(upload.fraud_score ?? 0) >= 75
          || repeatsTotal > 0 && repeatsUsed >= repeatsTotal
        ) {
          throw new Error(`The selected prescription for ${medication.name} is no longer valid for this pharmacy.`);
        }
      }
      const { data: order, error: orderErr } = await firestoreAdmin
        .from("orders")
        .insert({
          patient_id: userId,
          pharmacy_id: chosenPharmacyId,
          order_group_id: (group as { id: string }).id,
          medication_id: medication.id,
          medication_name: medication.name,
          prescription_upload_id: prescriptionUploadId,
          quantity: item.quantity,
          delivery_fee: 0,
          total_amount: customerPrice(Number(medication.price)) * item.quantity,
          delivery_km: chosenKm,
          priority: !!data.priority,
          scheduled_for: data.scheduledFor ?? null,
          status: isScheduled ? "scheduled" : "pending",
          delivery_address: data.delivery.address,
          delivery_lat: data.delivery.lat,
          delivery_lng: data.delivery.lng,
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          assignment_radius_km: 10,
          notes: data.notes ?? "",
          is_demo: false,
          recipient_name: data.recipient?.name ?? patientProfile?.full_name ?? null,
          recipient_phone: data.recipient?.phone ?? patientProfile?.phone ?? null,
          recipient_family_member_id: data.recipient?.familyMemberId ?? null,
          created_at: now,
          updated_at: now,
        } as never)
        .select("id, total_amount, delivery_fee")
        .single();

      if (orderErr || !order) {
        console.error("Order insert failed:", orderErr);
        throw orderErr ?? new Error("Order could not be created.");
      }
      const row = order as { id: string; total_amount: number; delivery_fee: number };
      created.push({ orderId: row.id, matched: true });
      if (prescriptionUploadId) {
        const { error: claimError } = await firestoreAdmin
          .from("prescription_uploads")
          .update({
            pharmacy_id: chosenPharmacyId,
            order_id: row.id,
            updated_at: now,
          })
          .eq("id", prescriptionUploadId);
        if (claimError) throw claimError;
      }
    }

    // 5. ONE notification per package
    const itemCount = data.items.length;
    await firestoreAdmin.from("notifications").insert({
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
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await firestoreAdmin
      .from("orders")
      .select("id, patient_id, pharmacy_id, medication_name, delivery_lat, delivery_lng, assignment_radius_km, status")
      .eq("id", data.orderId).maybeSingle();
    if (!order) return { ok: false, reason: "not_found" };
    if (order.patient_id !== userId) return { ok: false, reason: "forbidden" };
    if (order.pharmacy_id) return { ok: true, already_assigned: true };
    if (order.status === "cancelled") return { ok: false, reason: "cancelled" };
    if (!order.delivery_lat || !order.delivery_lng) return { ok: false, reason: "no_coords" };

    // Mark expired any open offers past TTL
    await firestoreAdmin.from("pharmacy_offers")
      .update({ status: "expired" })
      .eq("order_id", order.id)
      .eq("status", "open")
      .lt("expires_at", new Date().toISOString());

    // If any open offer still active, nothing to do
    const { data: stillOpen } = await firestoreAdmin
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
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => z.object({
    address: z.string().min(3).max(500),
    lat: z.number(), lng: z.number(),
    serviceRadiusKm: z.number().int().min(5).max(60).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await firestoreAdmin.from("profiles").update({
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
  .middleware([requireFirebaseAuth])
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
    await firestoreAdmin
      .from("profiles")
      .upsert({ user_id: userId, ...patch } as never, { onConflict: "user_id" });

    const { data: roleRow } = await firestoreAdmin
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role === "driver") {
      await firestoreAdmin.from("driver_locations").upsert({
        driver_id: userId, lat: data.lat, lng: data.lng,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: "driver_id" });
    }
    return { ok: true };
  });
