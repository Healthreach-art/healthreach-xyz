/**
 * End-to-end test: when a pharmacy adds a medication, a patient sees it
 * via Supabase realtime within a few seconds.
 *
 * Run:  bun scripts/e2e-inventory-realtime.ts
 *
 * Requires env:
 *   SUPABASE_URL                 (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY    (used to seed a fake pharmacy row)
 *   SUPABASE_PUBLISHABLE_KEY     (or VITE_SUPABASE_PUBLISHABLE_KEY) — anon channel
 *
 * The script:
 *   1. Subscribes (as anon) to postgres_changes on public.medications
 *   2. Inserts a synthetic medication row via the service-role client
 *   3. Asserts the INSERT event arrives at the subscriber within 5 s
 *   4. Cleans up the row + channel and exits 0/1 accordingly
 */
import { createClient } from "@supabase/supabase-js";

const URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY");
  process.exit(2);
}

const TIMEOUT_MS = 5000;
const TEST_NAME = `__E2E_RT_${Date.now()}`;

// Find any approved pharmacy to attach the test stock to.
const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const { data: pharm, error: pharmErr } = await admin
  .from("profiles")
  .select("user_id")
  .eq("approval_status", "approved")
  .limit(1)
  .maybeSingle();
if (pharmErr) { console.error("Lookup pharmacy failed:", pharmErr.message); process.exit(1); }
if (!pharm) { console.error("No approved pharmacy found — seed demo data first."); process.exit(1); }

// Patient-side: subscribe with anon key (RLS allows any authenticated user
// to browse medications; for this smoke test the anon channel is enough to
// confirm realtime broadcast latency).
const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false } });

let receivedAt = 0;
const startedAt = Date.now();
console.log(`[t=0ms] Subscribing to medications…`);

const channel = anon
  .channel(`e2e-meds-${Date.now()}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "medications" },
    (payload: any) => {
      if (payload.new?.name === TEST_NAME) {
        receivedAt = Date.now();
        console.log(`[t=${receivedAt - startedAt}ms] ✅ Patient received INSERT for ${TEST_NAME}`);
      }
    },
  );

await new Promise<void>((resolve, reject) => {
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") resolve();
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`Subscribe failed: ${status}`));
  });
});
console.log(`[t=${Date.now() - startedAt}ms] Subscribed. Inserting test medication…`);

// Pharmacy-side: insert (using service role to bypass auth in the test).
const { data: inserted, error: insertErr } = await admin
  .from("medications")
  .insert({
    pharmacy_id: pharm.user_id,
    name: TEST_NAME,
    price: 9.99,
    stock_quantity: 10,
    category: "Other",
    requires_prescription: false,
    description: "E2E realtime sync probe — safe to delete",
  })
  .select("id")
  .single();
if (insertErr || !inserted) {
  console.error("Insert failed:", insertErr?.message);
  await anon.removeChannel(channel);
  process.exit(1);
}
console.log(`[t=${Date.now() - startedAt}ms] Inserted ${inserted.id}. Waiting up to ${TIMEOUT_MS}ms for broadcast…`);

const deadline = Date.now() + TIMEOUT_MS;
while (!receivedAt && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 50));
}

// Cleanup
await admin.from("medications").delete().eq("id", inserted.id);
await anon.removeChannel(channel);

if (!receivedAt) {
  console.error(`❌ FAIL: Patient did NOT receive the new medication within ${TIMEOUT_MS}ms`);
  console.error(`   Check: ALTER PUBLICATION supabase_realtime ADD TABLE public.medications;`);
  process.exit(1);
}

const latency = receivedAt - startedAt;
console.log(`\n✅ PASS — pharmacy → patient realtime sync in ${latency}ms (< ${TIMEOUT_MS}ms)`);
process.exit(0);
