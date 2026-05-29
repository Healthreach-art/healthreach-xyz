# Why the driver isn't seeing orders

After tracing the flow, the driver dashboard stays empty because the chain breaks before a `delivery_offer` is ever inserted:

1. **No driver location row** — `getNearbyOffersForDriver` returns `{ reason: "no_location" }` whenever `driver_locations` has no row for the signed-in driver. Geolocation in the preview iframe is often blocked, so the driver looks "offline" to the dispatcher even after toggling online.
2. **No drivers in radius** — `dispatch_ready_order_to_drivers` only inserts offers for drivers whose `driver_status='online'` AND who have a `driver_locations` row within 20 km of the pickup. With zero seeded drivers in Cape Town, the SQL returns `inserted: 0` and the offer never appears.
3. **Pharmacy never reaches "ready"** — dispatch only fires when an order is `ready_for_pickup`. In testing flows the pharmacy account is logged out, so the order sits at `pending` forever and nothing fans out to drivers.
4. **Cross-account testing is hard** — one browser session = one role, so the patient places an order but no pharmacy/driver is signed in to advance it.

The fix is a Cape Town **mock pipeline** that simulates the missing participants so a single logged-in user can see the whole loop on their dashboard.

# Plan — Cape Town demo pipeline for all 3 dashboards

## 1. Seed a Cape Town mock world (one-time, idempotent)

Server fn `seedCapeTownDemo()` (admin-callable + auto-runs on first dashboard load if empty):
- 3 mock pharmacies around Cape Town CBD, Sea Point, Claremont (profiles + `pharmacy_branches` rows with real lat/lng, `service_radius_km=25`).
- 6 mock drivers spread across the city, each with:
  - `driver_status` row → `online`
  - `driver_locations` row with realistic lat/lng (V&A Waterfront, Observatory, Rondebosch, Bellville, Mowbray, Greenpoint)
  - `driver_documents` approved
- 1 mock patient in Gardens.
- A small medication catalogue per pharmacy (Panado, Allergex, Adco-Dol, etc.) with full SAHPRA-style descriptions.

## 2. Auto-advance demo orders ("Uber simulator")

New server fn `tickDemoDispatch()` invoked every 4s by a lightweight hook on each dashboard:
- Any `pending` order older than 8s where pharmacy is a mock → auto-accept, set `preparing`.
- Any `preparing` mock order older than 12s → `ready_for_pickup` and call `dispatch_ready_order_to_drivers`.
- Any open `delivery_offer` targeting a mock driver older than 6s → mock driver accepts → creates `deliveries` row, status `assigned` → `picked_up` → `out_for_delivery` → `delivered` on a 30s timeline.
- Driver location row of the assigned mock driver is interpolated toward the patient every tick so the live map animates.

This makes the **real** logged-in driver see incoming offers from real patients too (because dispatch now actually runs), and the **real** patient sees their order progress without needing a second browser.

## 3. Force-pin live location fallback

- `useDriverLocationBroadcaster` and `usePatientLocationBroadcaster` already exist. Add a "Use demo Cape Town location" button on each dashboard that writes a fixed lat/lng (CBD for patient, V&A for driver) when the browser blocks geolocation — guarantees the radius math works in the preview iframe.
- On driver login, immediately upsert `driver_locations` with the last known or demo coordinates so `getNearbyOffersForDriver` never returns `no_location`.

## 4. Driver dashboard — "Incoming offers" reliability

- Subscribe to `delivery_offers` realtime inserts AND poll every 3s as a fallback (Workers preview occasionally drops the socket).
- On render, if `offers.length === 0` AND no `driver_locations` row exists, show a clear "You're offline — share location" CTA instead of an empty card.
- Show distance to pickup + ETA + earnings on each offer card (already partly wired — confirm the row renders).

## 5. Patient + Pharmacy mock visibility

- **Patient dashboard**: an "Active order" card that mirrors `orders.status` with live driver pin on the existing `DeliveryMap`.
- **Pharmacy dashboard**: existing `PharmacyOffersInbox` already polls — add a "Demo: place test order from a mock patient" button so a logged-in pharmacy can trigger the loop without a second account.

## 6. Out of scope

- No schema changes — only seed data + new server fns + 2 small UI buttons.
- No changes to chat, reviews, selfie, or payments (already shipped).
- No email — still needs sender domain (separate request).

## Technical details

- New files: `src/lib/demo-pipeline.functions.ts` (`seedCapeTownDemo`, `tickDemoDispatch`, `placeMockPatientOrder`), `src/hooks/useDemoTicker.ts`.
- New migration: only an `is_demo boolean default false` flag on `profiles`, `orders`, `delivery_offers`, `deliveries` so the ticker only touches mock rows and never disturbs real users. + GRANTs.
- Mock driver "accept" is performed by `supabaseAdmin` inside the server fn (bypasses RLS) — never exposed to clients.
- Cape Town center `[-33.9249, 18.4241]` already set in `DeliveryMap`.
- Demo ticker is throttled (one server call per dashboard every 4s) and bails out instantly if no demo rows exist, so production cost is ~zero.

Approve and I'll ship it in one pass.