import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ─── Cape Town mock world ───────────────────────────────────────────────
// Stable UUIDs so re-running the seed is idempotent.
const MOCK_PATIENT_ID = "11111111-aaaa-4aaa-aaaa-000000000001";

const MOCK_PHARMACIES = [
  { id: "22222222-aaaa-4aaa-aaaa-000000000001", name: "Healthreach Pharmacy CBD", lat: -33.9249, lng: 18.4241, address: "Long St, Cape Town CBD" },
  { id: "22222222-aaaa-4aaa-aaaa-000000000002", name: "Healthreach Pharmacy Sea Point", lat: -33.9176, lng: 18.3850, address: "Main Rd, Sea Point" },
  { id: "22222222-aaaa-4aaa-aaaa-000000000003", name: "Healthreach Pharmacy Claremont", lat: -33.9866, lng: 18.4655, address: "Main Rd, Claremont" },
];

const MOCK_DRIVERS = [
  { id: "33333333-aaaa-4aaa-aaaa-000000000001", name: "Sipho M.",    lat: -33.9020, lng: 18.4200 }, // V&A Waterfront
  { id: "33333333-aaaa-4aaa-aaaa-000000000002", name: "Thandi K.",   lat: -33.9425, lng: 18.4720 }, // Observatory
  { id: "33333333-aaaa-4aaa-aaaa-000000000003", name: "Jaco P.",     lat: -33.9580, lng: 18.4760 }, // Rondebosch
  { id: "33333333-aaaa-4aaa-aaaa-000000000004", name: "Nomsa B.",    lat: -33.8930, lng: 18.5100 }, // Pinelands
  { id: "33333333-aaaa-4aaa-aaaa-000000000005", name: "Anele D.",    lat: -33.9470, lng: 18.4520 }, // Mowbray
  { id: "33333333-aaaa-4aaa-aaaa-000000000006", name: "Riaan V.",    lat: -33.9080, lng: 18.4100 }, // Green Point
];

const MOCK_MEDS = [
  { name: "Panado 500mg (24 tabs)", price: 45,  category: "Pain Relief",  description: "Paracetamol 500mg. For mild to moderate pain and fever reduction. Adults: 1–2 tablets every 4–6 hours, max 8 in 24 hours. Do not exceed stated dose. Keep out of reach of children. Schedule 0." },
  { name: "Allergex 4mg (30 tabs)", price: 38,  category: "Allergy",      description: "Chlorpheniramine maleate 4mg. Antihistamine for allergic rhinitis, hay fever and itching. May cause drowsiness; avoid driving. Schedule 1." },
  { name: "Adco-Dol (24 caps)",     price: 72,  category: "Pain Relief",  description: "Paracetamol, codeine phosphate, caffeine and meprobamate. For moderate pain. May cause drowsiness or dependence with prolonged use. Pharmacist advice required. Schedule 2." },
  { name: "Bioplus Energy (30ml)",  price: 32,  category: "Vitamins",     description: "Multivitamin and energy tonic with iron, B-complex and ginseng. For fatigue and convalescence. Take 5–10ml twice daily. Schedule 0." },
  { name: "Corenza C (12 sachets)", price: 65,  category: "Cold & Flu",   description: "Paracetamol, vitamin C, phenylephrine. For cold and flu symptoms. Dissolve 1 sachet in warm water, up to 4 times daily. Schedule 1." },
];

const CT_CENTER = { lat: -33.9249, lng: 18.4241 };

// ─── seedCapeTownDemo (idempotent) ───────────────────────────────────────
export const seedCapeTownDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const nowIso = new Date().toISOString();

    // 1. Mock patient profile
    await supabaseAdmin.from("profiles").upsert({
      user_id: MOCK_PATIENT_ID,
      full_name: "Demo Patient",
      email: "demo.patient@healthreach.local",
      phone: "+27 79 728 5078",
      address: "Gardens, Cape Town",
      latitude: -33.9300, longitude: 18.4100,
      is_demo: true,
      approval_status: "approved",
    }, { onConflict: "user_id" });

    // 2. Mock pharmacies + branches + medications
    for (const p of MOCK_PHARMACIES) {
      await supabaseAdmin.from("profiles").upsert({
        user_id: p.id,
        full_name: p.name,
        organization_name: p.name,
        email: `${p.id}@healthreach.local`,
        phone: "+27 79 728 5078",
        address: p.address,
        latitude: p.lat, longitude: p.lng,
        service_radius_km: 25,
        is_demo: true,
        approval_status: "approved",
      }, { onConflict: "user_id" });

      await supabaseAdmin.from("user_roles").upsert({
        user_id: p.id, role: "pharmacy" as any,
      } as any, { onConflict: "user_id,role" });

      // Branch
      const { data: existingBranch } = await supabaseAdmin
        .from("pharmacy_branches").select("id").eq("pharmacy_id", p.id).eq("is_primary", true).maybeSingle();
      if (!existingBranch) {
        await supabaseAdmin.from("pharmacy_branches").insert({
          pharmacy_id: p.id, name: "Main branch",
          address: p.address, latitude: p.lat, longitude: p.lng,
          service_radius_km: 25, is_primary: true, is_active: true,
        });
      }

      // Medications — check count first to avoid duplicating on each seed
      const { count } = await supabaseAdmin
        .from("medications").select("id", { count: "exact", head: true })
        .eq("pharmacy_id", p.id).eq("is_demo", true);
      if ((count ?? 0) === 0) {
        await supabaseAdmin.from("medications").insert(
          MOCK_MEDS.map((m) => ({
            pharmacy_id: p.id, name: m.name, price: m.price,
            stock_quantity: 100, category: m.category,
            description: m.description, is_demo: true,
          })),
        );
      }
    }

    // 3. Mock drivers + status (online) + live location + approved docs
    for (const d of MOCK_DRIVERS) {
      await supabaseAdmin.from("profiles").upsert({
        user_id: d.id,
        full_name: d.name,
        email: `${d.id}@healthreach.local`,
        phone: "+27 79 728 5078",
        latitude: d.lat, longitude: d.lng,
        is_demo: true, approval_status: "approved",
      }, { onConflict: "user_id" });

      await supabaseAdmin.from("user_roles").upsert({
        user_id: d.id, role: "driver" as any,
      } as any, { onConflict: "user_id,role" });

      await supabaseAdmin.from("driver_status").upsert({
        driver_id: d.id, status: "online", last_ping_at: nowIso,
      }, { onConflict: "driver_id" });

      await supabaseAdmin.from("driver_locations").upsert({
        driver_id: d.id, lat: d.lat, lng: d.lng, updated_at: nowIso,
      } as any, { onConflict: "driver_id" });
    }

    return { ok: true, pharmacies: MOCK_PHARMACIES.length, drivers: MOCK_DRIVERS.length };
  });

// ─── tickDemoDispatch — advance every demo order one step ────────────────
export const tickDemoDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const now = Date.now();
    const stats = { promoted: 0, dispatched: 0, accepted: 0, advanced: 0 };

    // A. mock-pharmacy orders older than 8s → accepted → preparing
    const { data: pendingOrders } = await supabaseAdmin
      .from("orders")
      .select("id, status, pharmacy_id, created_at, updated_at, delivery_address, delivery_lat, delivery_lng")
      .eq("is_demo", true)
      .in("status", ["pending", "accepted", "preparing"])
      .limit(50);

    for (const o of pendingOrders ?? []) {
      const ageMs = now - new Date(o.updated_at).getTime();
      const isMockPharm = MOCK_PHARMACIES.some((p) => p.id === o.pharmacy_id);
      if (!isMockPharm) continue;

      if (o.status === "pending" && ageMs > 5_000) {
        await supabaseAdmin.from("orders").update({
          status: "accepted", pharmacy_assigned_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any).eq("id", o.id);
        stats.promoted++;
      } else if (o.status === "accepted" && ageMs > 6_000) {
        await supabaseAdmin.from("orders").update({
          status: "preparing", updated_at: new Date().toISOString(),
        } as any).eq("id", o.id);
        stats.promoted++;
      } else if (o.status === "preparing" && ageMs > 8_000) {
        await supabaseAdmin.from("orders").update({
          status: "ready", updated_at: new Date().toISOString(),
        } as any).eq("id", o.id);
        // Fan out to nearby drivers via the existing SQL helper
        await (supabaseAdmin as any).rpc("dispatch_ready_order_to_drivers", {
          _order_id: o.id, _max_drivers: 30, _radius_km: 20,
        });
        stats.dispatched++;
      }
    }

    // B. mock-driver targeted offers older than 4s → auto-accept
    const { data: openOffers } = await supabaseAdmin
      .from("delivery_offers")
      .select("id, order_id, target_driver_id, created_at, status")
      .eq("status", "open")
      .limit(50);

    for (const o of openOffers ?? []) {
      if (!o.target_driver_id) continue;
      const isMockDriver = MOCK_DRIVERS.some((d) => d.id === o.target_driver_id);
      if (!isMockDriver) continue;
      const ageMs = now - new Date(o.created_at).getTime();
      if (ageMs < 4_000) continue;
      const { error } = await (supabaseAdmin as any).rpc("accept_delivery_offer_for_driver", {
        _offer_id: o.id, _driver_id: o.target_driver_id,
      });
      if (!error) {
        // Mark the resulting delivery as demo so it's identifiable
        await supabaseAdmin.from("deliveries").update({ is_demo: true } as any)
          .eq("order_id", o.order_id).eq("driver_id", o.target_driver_id);
        stats.accepted++;
      }
    }

    // C. advance assigned → picked_up → in_transit → delivered on a timer
    const { data: liveDels } = await supabaseAdmin
      .from("deliveries")
      .select("id, order_id, status, driver_id, updated_at")
      .eq("is_demo", true)
      .in("status", ["assigned", "picked_up", "in_transit"])
      .limit(50);

    for (const d of liveDels ?? []) {
      const ageMs = now - new Date(d.updated_at).getTime();
      const nextMap: Record<string, string> = {
        assigned: "picked_up",
        picked_up: "in_transit",
        in_transit: "delivered",
      };
      const orderStatusMap: Record<string, string> = {
        assigned: "out_for_delivery",
        picked_up: "out_for_delivery",
        in_transit: "delivered",
      };
      if (ageMs < 8_000) continue;
      const next = nextMap[d.status];
      if (!next) continue;
      await supabaseAdmin.from("deliveries").update({
        status: next, updated_at: new Date().toISOString(),
      } as any).eq("id", d.id);
      await supabaseAdmin.from("orders").update({
        status: orderStatusMap[d.status], updated_at: new Date().toISOString(),
      } as any).eq("id", d.order_id);
      stats.advanced++;

      // Interpolate driver location toward city center for live map effect
      const driver = MOCK_DRIVERS.find((m) => m.id === d.driver_id);
      if (driver) {
        const newLat = driver.lat + (CT_CENTER.lat - driver.lat) * 0.25;
        const newLng = driver.lng + (CT_CENTER.lng - driver.lng) * 0.25;
        await supabaseAdmin.from("driver_locations").upsert({
          driver_id: driver.id, lat: newLat, lng: newLng, order_id: d.order_id,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "driver_id" });
      }
    }

    return { ok: true, stats };
  });

// ─── placeMockPatientOrder — pharmacy clicks "demo order" ────────────────
export const placeMockPatientOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const pharmacyId = context.userId;
    // Ensure mock patient exists
    await supabaseAdmin.from("profiles").upsert({
      user_id: MOCK_PATIENT_ID, full_name: "Demo Patient",
      email: "demo.patient@healthreach.local", phone: "+27 79 728 5078",
      address: "Gardens, Cape Town", latitude: -33.9300, longitude: 18.4100,
      is_demo: true, approval_status: "approved",
    }, { onConflict: "user_id" });

    const { data: pharm } = await supabaseAdmin
      .from("profiles").select("latitude, longitude, address")
      .eq("user_id", pharmacyId).maybeSingle();

    const med = MOCK_MEDS[Math.floor(Math.random() * MOCK_MEDS.length)];
    const { data: order, error } = await supabaseAdmin.from("orders").insert({
      patient_id: MOCK_PATIENT_ID,
      pharmacy_id: pharmacyId,
      medication_name: med.name,
      quantity: 1,
      total_amount: med.price,
      delivery_fee: 35,
      status: "pending",
      delivery_address: "12 Kloof St, Gardens, Cape Town",
      pickup_lat: pharm?.latitude ?? -33.9249,
      pickup_lng: pharm?.longitude ?? 18.4241,
      delivery_lat: -33.9300, delivery_lng: 18.4100,
      is_demo: true,
      notes: "Demo order from mock patient",
    } as any).select("id").maybeSingle();

    if (error) throw new Error(error.message);
    if (order?.id) {
      await (supabaseAdmin as any).rpc("dispatch_ready_order_to_drivers", {
        _order_id: order.id,
        _max_drivers: 30,
        _radius_km: 20,
      });
    }
    return { ok: true, orderId: order?.id };
  });

// ─── setDemoLocation — patient/driver "use Cape Town" fallback ──────────
export const setDemoLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    role: z.enum(["patient", "driver"]),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    // Default to V&A Waterfront for driver, Gardens for patient
    const def = data.role === "driver"
      ? { lat: -33.9020, lng: 18.4200 }
      : { lat: -33.9300, lng: 18.4100 };
    const lat = data.lat ?? def.lat;
    const lng = data.lng ?? def.lng;

    if (data.role === "driver") {
      await supabaseAdmin.from("driver_locations").upsert({
        driver_id: userId, lat, lng, updated_at: new Date().toISOString(),
      } as any, { onConflict: "driver_id" });
      await supabaseAdmin.from("driver_status").upsert({
        driver_id: userId, status: "online", last_ping_at: new Date().toISOString(),
      }, { onConflict: "driver_id" });
    } else {
      const street = `Demo location · Cape Town`;
      const { data: existing } = await supabaseAdmin
        .from("user_addresses").select("id")
        .eq("user_id", userId).eq("label", "Current location").maybeSingle();
      if (existing?.id) {
        await supabaseAdmin.from("user_addresses").update({
          street, lat, lng, is_default: true,
        }).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("user_addresses").insert({
          user_id: userId, label: "Current location", street, lat, lng, is_default: true,
        });
      }
    }
    return { ok: true, lat, lng };
  });
