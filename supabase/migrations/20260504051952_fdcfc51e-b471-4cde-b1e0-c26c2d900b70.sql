
DO $$
DECLARE
  v_patient_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_pharmacy_id uuid := '22222222-2222-2222-2222-222222222222';
  v_driver_id   uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  -- Clean up any partial records
  DELETE FROM auth.identities WHERE user_id IN (v_patient_id, v_pharmacy_id, v_driver_id);
  DELETE FROM auth.users WHERE id IN (v_patient_id, v_pharmacy_id, v_driver_id);

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000', v_patient_id, 'authenticated', 'authenticated', 'patient.demo@healthreach.co.za', crypt('DemoPatient!2025', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Demo Patient","role":"patient"}'::jsonb, now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_pharmacy_id, 'authenticated', 'authenticated', 'pharmacy.demo@healthreach.co.za', crypt('DemoPharmacy!2025', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Demo Pharmacy Manager","role":"pharmacy"}'::jsonb, now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_driver_id, 'authenticated', 'authenticated', 'driver.demo@healthreach.co.za', crypt('DemoDriver!2025', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Demo Driver","role":"driver"}'::jsonb, now(), now(), '', '', '', '');

  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_patient_id::text,  v_patient_id,  jsonb_build_object('sub', v_patient_id::text,  'email', 'patient.demo@healthreach.co.za',  'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_pharmacy_id::text, v_pharmacy_id, jsonb_build_object('sub', v_pharmacy_id::text, 'email', 'pharmacy.demo@healthreach.co.za', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_driver_id::text,   v_driver_id,   jsonb_build_object('sub', v_driver_id::text,   'email', 'driver.demo@healthreach.co.za',   'email_verified', true), 'email', now(), now(), now());

  INSERT INTO public.profiles (user_id, full_name, email, organization_name, phone, address, approval_status) VALUES
    (v_patient_id,  'Demo Patient',          'patient.demo@healthreach.co.za',  '',                  '+27 11 000 0001', '12 Demo Street, Johannesburg', 'approved'),
    (v_pharmacy_id, 'Demo Pharmacy Manager', 'pharmacy.demo@healthreach.co.za', 'Demo Pharmacy Co.', '+27 11 000 0002', '45 Mock Road, Sandton',        'approved'),
    (v_driver_id,   'Demo Driver',           'driver.demo@healthreach.co.za',   '',                  '+27 11 000 0003', 'Mobile — Johannesburg metro',  'approved')
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, organization_name = EXCLUDED.organization_name, phone = EXCLUDED.phone, address = EXCLUDED.address, approval_status = 'approved';

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_patient_id,  'patient'),
    (v_pharmacy_id, 'pharmacy'),
    (v_driver_id,   'driver')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Seed a second demo pharmacy organization for richer Uber-style browsing
  INSERT INTO public.medications (pharmacy_id, name, description, price, stock_quantity, category, requires_prescription)
  SELECT v_pharmacy_id, 'Paracetamol 500mg', 'Pain & fever relief — 20 tablets', 45.00, 120, 'Pain Relief', false
  WHERE NOT EXISTS (SELECT 1 FROM public.medications m WHERE m.pharmacy_id = v_pharmacy_id AND m.name = 'Paracetamol 500mg');
  INSERT INTO public.medications (pharmacy_id, name, description, price, stock_quantity, category, requires_prescription)
  SELECT v_pharmacy_id, 'Amoxicillin 500mg', 'Antibiotic — 15 capsules', 120.00, 60, 'Antibiotics', true
  WHERE NOT EXISTS (SELECT 1 FROM public.medications m WHERE m.pharmacy_id = v_pharmacy_id AND m.name = 'Amoxicillin 500mg');
  INSERT INTO public.medications (pharmacy_id, name, description, price, stock_quantity, category, requires_prescription)
  SELECT v_pharmacy_id, 'Vitamin D3 1000IU', 'Daily supplement — 30 tablets', 85.00, 200, 'Vitamins', false
  WHERE NOT EXISTS (SELECT 1 FROM public.medications m WHERE m.pharmacy_id = v_pharmacy_id AND m.name = 'Vitamin D3 1000IU');
  INSERT INTO public.medications (pharmacy_id, name, description, price, stock_quantity, category, requires_prescription)
  SELECT v_pharmacy_id, 'Ibuprofen 200mg', 'Anti-inflammatory — 24 tablets', 55.00, 80, 'Pain Relief', false
  WHERE NOT EXISTS (SELECT 1 FROM public.medications m WHERE m.pharmacy_id = v_pharmacy_id AND m.name = 'Ibuprofen 200mg');
  INSERT INTO public.medications (pharmacy_id, name, description, price, stock_quantity, category, requires_prescription)
  SELECT v_pharmacy_id, 'Cetirizine 10mg', 'Allergy relief — 30 tablets', 65.00, 90, 'Allergy', false
  WHERE NOT EXISTS (SELECT 1 FROM public.medications m WHERE m.pharmacy_id = v_pharmacy_id AND m.name = 'Cetirizine 10mg');
END $$;
