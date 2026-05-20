import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const codeInput = z.object({ code: z.string().min(4).max(128) });

/**
 * Promote the currently signed-in user to admin if they supply the
 * correct ADMIN_INVITE_CODE secret. Replaces their existing self-assigned
 * role with `admin` and auto-approves the profile.
 */
export const claimAdminWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => codeInput.parse(i))
  .handler(async ({ data, context }) => {
    const expected = process.env.ADMIN_INVITE_CODE;
    if (!expected) throw new Error("Admin invite code is not configured");
    if (data.code.trim() !== expected.trim()) {
      throw new Error("Invalid invite code");
    }
    const userId = context.userId;
    // Remove any existing role rows for this user, then insert admin.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: insertErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (insertErr) throw new Error(insertErr.message);
    await supabaseAdmin
      .from("profiles")
      .update({ approval_status: "approved" })
      .eq("user_id", userId);
    return { ok: true };
  });

const broadcastInput = z.object({
  audience: z.enum(["all", "patient", "pharmacy", "driver", "hospital"]),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  link: z.string().max(255).optional().default(""),
});

/**
 * Admin-only: insert an in-app notification for every user matching the
 * audience role (or every user when audience === "all"). Bypasses RLS via
 * the service-role client because notifications RLS only permits an admin
 * caller to insert into their own user_id row otherwise.
 */
export const broadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => broadcastInput.parse(i))
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Admin role required");

    let userIds: string[] = [];
    if (data.audience === "all") {
      const { data: rows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id");
      userIds = (rows ?? []).map((r) => r.user_id);
    } else {
      const { data: rows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", data.audience);
      userIds = (rows ?? []).map((r) => r.user_id);
    }
    // Dedupe
    userIds = Array.from(new Set(userIds));
    if (userIds.length === 0) return { ok: true, count: 0 };

    const rows = userIds.map((uid) => ({
      user_id: uid,
      category: "announcement",
      title: data.title,
      body: data.body,
      link: data.link ?? "",
    }));
    // Chunk inserts to stay under PostgREST payload limits.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabaseAdmin
        .from("notifications")
        .insert(rows.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: rows.length };
  });

// ============================================================================
// Real Johannesburg demo seed — pharmacies, drivers, medications
// ============================================================================

type DemoPharmacy = {
  email: string;
  org: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
};

const DEMO_PHARMACIES: DemoPharmacy[] = [
  { email: "demo-clicks-sandton@healthreach.co.za", org: "Clicks Pharmacy Sandton City",
    address: "Sandton City Shopping Centre, Sandhurst, Sandton, 2196",
    lat: -26.1076, lng: 28.0567, phone: "+27 11 217 6000" },
  { email: "demo-dischem-rosebank@healthreach.co.za", org: "Dis-Chem Pharmacy Rosebank",
    address: "The Zone @ Rosebank, 177 Oxford Rd, Rosebank, Johannesburg, 2196",
    lat: -26.1465, lng: 28.0436, phone: "+27 11 880 0034" },
  { email: "demo-alphapharm-melville@healthreach.co.za", org: "Alpha Pharm Melville",
    address: "7th Street, Melville, Johannesburg, 2092",
    lat: -26.1761, lng: 28.0096, phone: "+27 11 482 4444" },
  { email: "demo-medirite-braamfontein@healthreach.co.za", org: "Medirite Pharmacy Braamfontein",
    address: "Braamfontein, Johannesburg, 2001",
    lat: -26.1929, lng: 28.0357, phone: "+27 11 403 2200" },
];

type DemoDriver = { email: string; name: string; address: string; lat: number; lng: number; phone: string };

const DEMO_DRIVERS: DemoDriver[] = [
  { email: "demo-driver-thabo@healthreach.co.za", name: "Thabo Mokoena",
    address: "Hillbrow, Johannesburg, 2001", lat: -26.1879, lng: 28.0490, phone: "+27 82 555 0101" },
  { email: "demo-driver-naledi@healthreach.co.za", name: "Naledi Khumalo",
    address: "Parktown, Johannesburg, 2193", lat: -26.1773, lng: 28.0436, phone: "+27 82 555 0202" },
];

type DemoMed = { name: string; price: number; description: string; rx: boolean; category: string };
const DEMO_MEDS: DemoMed[] = [
  { name: "Panado 500mg", price: 35, description: "Paracetamol tablets, pack of 20", rx: false, category: "Pain relief" },
  { name: "Allergex 4mg", price: 42, description: "Chlorphenamine antihistamine, 20 tablets", rx: false, category: "Allergy" },
  { name: "Adco-Dol", price: 58, description: "Paracetamol + Codeine combination, 24 tablets", rx: false, category: "Pain relief" },
  { name: "Ventolin Inhaler 100mcg", price: 95, description: "Salbutamol asthma reliever inhaler", rx: true, category: "Respiratory" },
  { name: "Voltaren Emulgel 50g", price: 110, description: "Diclofenac topical anti-inflammatory gel", rx: false, category: "Pain relief" },
  { name: "Bioplus Energy Recovery", price: 65, description: "Vitamin B complex tonic, 200ml", rx: false, category: "Vitamins" },
  { name: "Med-Lemon Hot Drink", price: 28, description: "Cold & flu hot lemon sachets, 8s", rx: false, category: "Cold & Flu" },
  { name: "Amoxil 500mg", price: 120, description: "Amoxicillin antibiotic capsules, 21s", rx: true, category: "Antibiotics" },
  { name: "Mybulen", price: 49, description: "Ibuprofen + Paracetamol + Codeine, 24s", rx: false, category: "Pain relief" },
  { name: "Centrum Adults A-Z", price: 189, description: "Multivitamin tablets, 30s", rx: false, category: "Vitamins" },
  { name: "Stilpane Syrup 100ml", price: 72, description: "Pain & fever syrup with codeine", rx: false, category: "Pain relief" },
  { name: "Eltroxin 100mcg", price: 95, description: "Levothyroxine thyroid tablets, 100s", rx: true, category: "Chronic" },
];

const DEMO_PASSWORD = "Demo!2026";

async function findUserIdByEmail(email: string): Promise<string | null> {
  // No direct lookup-by-email — iterate the first pages.
  const perPage = 1000;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function ensureDemoUser(email: string, fullName: string, role: "pharmacy" | "driver", profile: Partial<{
  organization_name: string; address: string; latitude: number; longitude: number; phone: string;
}>): Promise<string> {
  let userId = await findUserIdByEmail(email);
  if (!userId) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: DEMO_PASSWORD, email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error || !data.user) throw new Error(`Create ${email}: ${error?.message || "no user"}`);
    userId = data.user.id;
  }
  // handle_new_user trigger inserts profile + role; we just patch the extras + approve.
  await supabaseAdmin.from("profiles").update({
    full_name: fullName,
    organization_name: profile.organization_name ?? "",
    address: profile.address ?? "",
    latitude: profile.latitude ?? null,
    longitude: profile.longitude ?? null,
    phone: profile.phone ?? "",
    approval_status: "approved",
  } as never).eq("user_id", userId);
  // Ensure role exists (idempotent — unique (user_id,role))
  await supabaseAdmin.from("user_roles").upsert(
    { user_id: userId, role } as never,
    { onConflict: "user_id,role" } as never,
  );
  return userId;
}

export const seedJohannesburgDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Admin gate
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin role required");

    const summary = { pharmacies: 0, drivers: 0, medications: 0, password: DEMO_PASSWORD };

    // Pharmacies
    const pharmacyIds: string[] = [];
    for (const p of DEMO_PHARMACIES) {
      const id = await ensureDemoUser(p.email, p.org, "pharmacy", {
        organization_name: p.org, address: p.address, latitude: p.lat, longitude: p.lng, phone: p.phone,
      });
      pharmacyIds.push(id);
      summary.pharmacies++;
    }

    // Drivers — also seed driver_locations + online status
    for (const d of DEMO_DRIVERS) {
      const id = await ensureDemoUser(d.email, d.name, "driver", {
        address: d.address, latitude: d.lat, longitude: d.lng, phone: d.phone,
      });
      await supabaseAdmin.from("driver_locations").upsert({
        driver_id: id, lat: d.lat, lng: d.lng, updated_at: new Date().toISOString(),
      } as never, { onConflict: "driver_id" });
      await supabaseAdmin.from("driver_status").upsert({
        driver_id: id, status: "online", last_ping_at: new Date().toISOString(),
      } as never, { onConflict: "driver_id" });
      summary.drivers++;
    }

    // Medications — one row per pharmacy per med, only insert if missing
    for (const pid of pharmacyIds) {
      const { data: existing } = await supabaseAdmin
        .from("medications").select("name").eq("pharmacy_id", pid);
      const have = new Set((existing ?? []).map((m: { name: string }) => m.name.toLowerCase()));
      const toInsert = DEMO_MEDS
        .filter((m) => !have.has(m.name.toLowerCase()))
        .map((m) => ({
          pharmacy_id: pid,
          name: m.name,
          price: m.price,
          description: m.description,
          category: m.category,
          requires_prescription: m.rx,
          stock_quantity: 50 + Math.floor(Math.random() * 100),
        }));
      if (toInsert.length > 0) {
        const { error } = await supabaseAdmin.from("medications").insert(toInsert as never);
        if (error) throw new Error(`Medications for ${pid}: ${error.message}`);
        summary.medications += toInsert.length;
      }
    }

    return { ok: true, ...summary };
  });

