## What I'll ship (in this order)

### 1. Brand logo (green, Uber-style "HealthReach" pill)
- Generate a single SVG/PNG logo asset (green pill, white "HealthReach" wordmark inside, rounded — like Uber's tag style).
- Swap it into `Header.tsx`, `AppSidebar.tsx` header, root header strip, and favicon meta references. Removes the gradient "H" square + split-color wordmark currently used.

### 2. Dashboard quick-action illustrations
On `dashboard.patient.index.tsx`, add real illustrations to each tile:
- Book Appointment → doctor/stethoscope
- Order Medicine → pill bottle
- Upload Prescription → script paper
- Track Delivery → delivery scooter (SA context)
- AI Medicine Assistant → friendly AI/chat bubble
Generated as 5 PNGs (transparent), imported into the tile cards.

### 3. Doctors & Pharmacies: real users only + photos
- `doctors.index.tsx` / patient `find` / `doctors.$id.tsx`: only show doctors whose `user_id` exists in `auth.users` AND have `approval_status = 'approved'` AND `profile_photo_url IS NOT NULL`. Render `profile_photo_url` (fallback initials avatar).
- Same for pharmacy listings: require linked `user_id`, approved, and show `logo_url`/branch photo.
- One migration adds a view (or RPC) `public_doctors` / `public_pharmacies` that joins to auth + filters; frontend reads the view. This also "removes mockup data" without destructive deletes — seeds/demos without a real auth user simply stop appearing.

### 4. Pickup code persists until order is `completed`
Symptom: pharmacy pickup code disappears on refresh or when leaving the page.
- Audit `PickupCodeDialog` + pharmacy dashboard: ensure code is read from `orders.pickup_code` (DB), not local state.
- Render the code on every order card whose status is in (`ready_for_pickup`, `picked_up`, `out_for_delivery`) — only hide when `status = 'completed'` or `cancelled`.
- If `pickup_code` column missing on `orders`, migration adds it + backfills.

### 5. Realtime messaging works across the platform
- One migration: `ALTER PUBLICATION supabase_realtime ADD TABLE appointment_messages, order_messages, notifications;` + `REPLICA IDENTITY FULL` on each.
- `AppointmentChatDialog` and `OrderChatDialog`: subscribe to `postgres_changes` filtered by the thread id, append new rows to local state, scroll to bottom. Confirm send path inserts with correct `sender_id = auth.uid()` so RLS doesn't 401.
- Verify RLS allows both sides (patient + provider) to `SELECT` + `INSERT` on the relevant thread.

### 6. "Remove mockup, use real data"
- Patient dashboard widgets currently using placeholder numbers → wire to existing hooks (`usePatientStats`, real queries) where a real source exists; otherwise show empty state ("No orders yet") instead of fake numbers.
- Doctors/pharmacy filters above already enforce real-user-only.
- I will NOT delete rows from the DB — filtering at the read layer is reversible.

## Technical notes
- New migration files: realtime publication + (maybe) `pickup_code` column + `public_doctors`/`public_pharmacies` views with `security_invoker=on`.
- New assets: 1 logo + 5 dashboard illustrations (generated, transparent PNG).
- No schema-breaking changes; no destructive deletes.

## Out of scope (tell me if you want these too)
- Redesigning the doctor/pharmacy card layouts beyond adding photo + name.
- Push notifications / SMS — in-app realtime only.
- Driver chat (same pattern would apply if you want it next).