-- Remove the 10 seeded mock pharmacy accounts that nobody logs into.
-- Keep only providers that map to a real demo login on the login page
-- (pharmacy.demo, doctor.demo, driver.demo, patient.demo, admin.demo).
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    'a0000001-0000-0000-0000-000000000001',
    'a0000001-0000-0000-0000-000000000002',
    'a0000001-0000-0000-0000-000000000003',
    'a0000001-0000-0000-0000-000000000004',
    'a0000001-0000-0000-0000-000000000005',
    'a0000001-0000-0000-0000-000000000006',
    'a0000001-0000-0000-0000-000000000007',
    'a0000001-0000-0000-0000-000000000008',
    'a0000001-0000-0000-0000-000000000009',
    'a0000001-0000-0000-0000-000000000010'
  ]::uuid[];
BEGIN
  -- Wipe dependent rows that may not cascade
  DELETE FROM public.pharmacy_documents WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.pharmacy_branches WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.pharmacy_offers WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.pharmacy_appointments WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.medications WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.notifications WHERE user_id = ANY(v_ids);
  DELETE FROM public.user_roles WHERE user_id = ANY(v_ids);
  DELETE FROM public.profiles WHERE user_id = ANY(v_ids);
  DELETE FROM auth.identities WHERE user_id = ANY(v_ids);
  DELETE FROM auth.users WHERE id = ANY(v_ids);
END $$;