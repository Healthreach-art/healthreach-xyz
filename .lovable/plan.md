
# HealthReach admin + cleanup overhaul

## 1. Wipe the two emails and seed them as admins

**Destructive — runs once.** Migration that:
- Deletes `auth.users` rows for `jasonbayman5@gmail.com` and `hlawumal@gmail.com` (cascades to `profiles`, `user_roles`, `orders`, `prescriptions`, etc. through existing FKs).
- Installs a `handle_new_user_seed_admin` trigger on `auth.users` insert: when either of those two emails signs up, auto-create their `profile` (approved) and `user_roles` row with role `admin`. **The password they set on that fresh signup becomes their permanent admin password** (Supabase stores it hashed — nothing special to do beyond letting them sign up normally).
- They can promote other users to `admin` from the admin panel (existing `claimAdminWithCode` / a new "Grant admin" button on the user row).

## 2. Remove ALL demo data + demo logins

**Migration:**
- `DELETE FROM public.medications WHERE is_demo = true`
- `DELETE FROM public.doctors  WHERE is_demo = true`
- `DELETE` demo profiles / user_roles / driver_status / driver_locations tied to `profiles.is_demo = true`, then `DELETE FROM auth.users` for those user_ids.

**Code:**
- Remove `seedJohannesburgDemo` from `src/lib/admin.functions.ts` and any "Seed demo data" button in admin UI.
- Remove any "Try demo" / prefilled demo credentials from `src/routes/login.tsx`, `signup.tsx`, and admin signup.

## 3. Admin dashboard — partner approvals & operational UX

- `dashboard.admin.tsx`: ensure the **Pending Approvals** queue shows pharmacies + drivers + doctors with Approve / Reject actions. Approve sets `profiles.approval_status = 'approved'` (and `doctors.is_verified = true` for doctors). After approval, partner dashboards already gate on `approval_status` — they begin operating.
- **Users tab**: include partners *and* patients (currently filtered). Add role filter chips: All / Patients / Pharmacies / Drivers / Doctors / Admins. Add a "Grant admin" action per row (admin-only RPC).
- **No location requirement**: remove any `geolocation`/live-map gate on the admin pages. The live map view stays as an optional tab; the rest of admin works without it.
- **New Admin Logs page** (`/dashboard/admin/logs`):
  - New `admin_audit_log` table (admin_id, action, target_user_id, target_type, payload jsonb, created_at) + RLS (admins read all, system inserts).
  - Triggers/RPCs that mutate approval status, grant roles, or broadcast notifications insert an audit row.
  - Page lists recent entries with filters by action/admin/date.

## 4. Partner dashboards start operating on approval

- Audit `dashboard.pharmacy.tsx`, `dashboard.driver.tsx`, `dashboard.doctor.tsx`, `dashboard.hospital.tsx` — when `approval_status='approved'`, the "awaiting approval" placeholder is replaced with the live operational view. Fix any remaining cases that still block.

## 5. Password reset flow

- `forgot-password.tsx`: pass `redirectTo: ${window.location.origin}/reset-password` (already on the right shape — verify and fix if missing). Auth's redirect-URL allow-list will be widened via Supabase configure if needed.
- `reset-password.tsx`: confirm it handles `type=recovery` from the URL hash, calls `supabase.auth.updateUser({ password })`, then routes to `/dashboard/patient` (or role-correct home).
- Test end-to-end against `healthreach.xyz`.

## 6. Data persistence on refresh / re-login

- Audit pages that fetch user-scoped data behind an unguarded `useEffect`: gate every fetch on `authReady && user` (same fix already applied to orders). Specific files: `dashboard.patient.prescriptions.tsx`, `dashboard.patient.transactions.tsx`, `dashboard.patient.addresses.tsx`, `dashboard.patient.payment-methods.tsx`, `dashboard.patient.reminders.tsx`, `dashboard.pharmacy.inventory.tsx`, `dashboard.driver.tsx`, `dashboard.doctor.tsx`.

## 7. Logo refresh

- Use the uploaded HealthReach logo as the canonical brand asset.
- Regenerate favicons + apple-touch + og-image from it.
- Update `--primary` / brand surface tokens in `src/styles.css` to match the sage-green from the logo (approx `oklch(0.68 0.05 175)` background, deep-teal accent).
- Header/sidebar logo swap to the new image.

## Technical details

- Sole-admin trigger uses `SECURITY DEFINER`, reads `NEW.email`, inserts into `public.profiles` + `public.user_roles` only when role row is missing.
- Cascading delete relies on existing `ON DELETE CASCADE` on `profiles.user_id → auth.users.id`; tables without cascade (orders, prescriptions) get cleaned explicitly in the migration.
- Audit log uses `SECURITY DEFINER` insert RPC so triggers can write without granting INSERT to admins directly.
- All changes ship behind one migration + a batch of file edits. No edge functions added; everything stays inside `createServerFn` / DB triggers.

## Out of scope (flag if you want them)

- Email template branding (the recovery email body itself).
- Migrating existing patient passwords.
- Rebuilding the live map — it stays, just no longer required to use admin.
