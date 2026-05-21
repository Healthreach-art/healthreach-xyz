## What I'll build

### 1. Enforce real address at signup (no fake/free-text addresses)
- Add the existing `AddressPicker` (Google Places + lat/lng) to `src/routes/signup.tsx` as a **required** field for every role (patient, pharmacy, driver, hospital).
- The form will block submission unless the user picks a Google-verified address (must have `lat`/`lng`) OR clicks "Use current location".
- On successful signup, the picked `address` + `lat` + `lng` are written to `profiles` via a new server function `setSignupLocation` so the dispatcher/driver-routing can use them immediately.
- For drivers, the same address seeds their starting position in `driver_locations`.
- For pharmacies, this replaces the separate "set pharmacy location" step — they're routable the moment admin approves them.

### 2. Seed real Johannesburg demo data (admin-triggered, idempotent)
- New admin-only server function `seedJohannesburgDemo` in `src/lib/admin.functions.ts` that, when called, creates:
  - **4 real Johannesburg pharmacies** at real addresses (Clicks Sandton City, Dis-Chem Rosebank, Alpha Pharm Melville, Medirite Braamfontein) — each as an auth user via `supabaseAdmin.auth.admin.createUser`, with `profiles` row (lat/lng/address/approval_status='approved') and `pharmacy` role.
  - **2 real demo drivers** with Johannesburg starting locations + approved status.
  - **~12 common SA medications** (Panado, Allergex, Ventolin, Adco-Dol, etc.) stocked across all 4 pharmacies with real ZAR prices.
- A small "Seed demo data" button on the admin dashboard that calls it. Safe to re-run (checks for existing demo emails before insert).

### 3. Live tracking map
- **Patient side** (`src/routes/dashboard.patient.orders.tsx`): when an order is `out_for_delivery`, expand the row to show the existing `DeliveryMap` with the driver's live position from `driver_locations` (already realtime-enabled).
- **Admin side**: new route `src/routes/dashboard.admin.live.tsx` showing a single Google Map with all online drivers (green pins), all approved pharmacies (blue pins), and all active orders (orange pins). Subscribes to `driver_locations` realtime updates.

## Technical notes

- `AddressPicker.tsx`, `useDriverLocationBroadcaster`, `find_pharmacies_near` RPC, and `setPharmacyLocation` server fn already exist — I'll reuse them.
- Migration needed: enable realtime on `driver_locations` (`ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;`) if not already enabled.
- No new secrets needed — Google Maps connector is already wired (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`).
- Demo pharmacy auth users use password `Demo!2026` and emails like `demo-clicks-sandton@healthreach.co.za` — admin can share or rotate.

## Files touched

- `src/routes/signup.tsx` — add required AddressPicker
- `src/lib/dispatch.functions.ts` — add `setSignupLocation`
- `src/lib/admin.functions.ts` — add `seedJohannesburgDemo`
- `src/routes/dashboard.admin.tsx` — add "Seed demo data" button
- `src/routes/dashboard.admin.live.tsx` — NEW live map
- `src/routes/dashboard.patient.orders.tsx` — inline live tracking map
- `supabase/migrations/...` — enable realtime on driver_locations (if missing)
