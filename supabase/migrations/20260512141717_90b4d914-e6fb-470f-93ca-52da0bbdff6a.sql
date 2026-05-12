
-- Seed 10 demo pharmacies
DO $$
DECLARE
  v_data jsonb := '[
    {"id":"a0000001-0000-0000-0000-000000000001","name":"Clicks Pharmacy Sandton","contact":"Sarah van der Merwe","email":"sandton@clicks.demo","phone":"+27 11 783 1100","address":"Nelson Mandela Square, Sandton, Johannesburg"},
    {"id":"a0000001-0000-0000-0000-000000000002","name":"Dis-Chem Rosebank","contact":"Thabo Mokoena","email":"rosebank@dischem.demo","phone":"+27 11 880 4422","address":"The Zone @ Rosebank, Johannesburg"},
    {"id":"a0000001-0000-0000-0000-000000000003","name":"Alpha Pharm Melville","contact":"Priya Naidoo","email":"melville@alphapharm.demo","phone":"+27 11 482 7711","address":"7th Street, Melville, Johannesburg"},
    {"id":"a0000001-0000-0000-0000-000000000004","name":"MediRite Fourways","contact":"Johan Pretorius","email":"fourways@medirite.demo","phone":"+27 11 467 5500","address":"Fourways Mall, Sandton"},
    {"id":"a0000001-0000-0000-0000-000000000005","name":"Link Pharmacy Soweto","contact":"Lerato Dlamini","email":"soweto@linkpharm.demo","phone":"+27 11 938 2244","address":"Maponya Mall, Soweto"},
    {"id":"a0000001-0000-0000-0000-000000000006","name":"Pick n Pay Pharmacy Greenstone","contact":"Aisha Patel","email":"greenstone@pnppharm.demo","phone":"+27 11 458 9911","address":"Greenstone Mall, Edenvale"},
    {"id":"a0000001-0000-0000-0000-000000000007","name":"Healthwise Randburg","contact":"Michael Botha","email":"randburg@healthwise.demo","phone":"+27 11 326 4400","address":"Cresta Shopping Centre, Randburg"},
    {"id":"a0000001-0000-0000-0000-000000000008","name":"Mopani Pharmacy Centurion","contact":"Refilwe Mahlangu","email":"centurion@mopani.demo","phone":"+27 12 663 7788","address":"Centurion Mall, Centurion"},
    {"id":"a0000001-0000-0000-0000-000000000009","name":"Springbok Pharmacy Midrand","contact":"David Khumalo","email":"midrand@springbok.demo","phone":"+27 11 312 5566","address":"Mall of Africa, Midrand"},
    {"id":"a0000001-0000-0000-0000-000000000010","name":"Wellness Pharmacy Pretoria East","contact":"Naledi Sithole","email":"pretoria@wellnessrx.demo","phone":"+27 12 998 3322","address":"Menlyn Park, Pretoria"}
  ]'::jsonb;
  v_meds jsonb := '[
    {"name":"Panado 500mg (20 tabs)","price":35,"stock":120,"cat":"Pain Relief","rx":false},
    {"name":"Ibuprofen 400mg (24 tabs)","price":48,"stock":85,"cat":"Pain Relief","rx":false},
    {"name":"Disprin Extra (24 tabs)","price":42,"stock":70,"cat":"Pain Relief","rx":false},
    {"name":"Voltaren Emulgel 50g","price":129,"stock":40,"cat":"Pain Relief","rx":false},
    {"name":"Med-Lemon Hot Powder (10 sachets)","price":55,"stock":90,"cat":"Cold & Flu","rx":false},
    {"name":"Allergex 4mg (30 tabs)","price":38,"stock":60,"cat":"Cold & Flu","rx":false},
    {"name":"Sinutab Sinus Tablets (24)","price":89,"stock":50,"cat":"Cold & Flu","rx":false},
    {"name":"Vitamin C 1000mg (30 tabs)","price":75,"stock":110,"cat":"Vitamins","rx":false},
    {"name":"Centrum Multivitamin (60)","price":189,"stock":45,"cat":"Vitamins","rx":false},
    {"name":"Omega-3 Fish Oil (90 caps)","price":215,"stock":35,"cat":"Vitamins","rx":false},
    {"name":"Magnesium Citrate 200mg (60)","price":145,"stock":40,"cat":"Vitamins","rx":false},
    {"name":"Calpol Infant Suspension 100ml","price":65,"stock":55,"cat":"Baby Care","rx":false},
    {"name":"Bennetts Bum Cream 50g","price":52,"stock":48,"cat":"Baby Care","rx":false},
    {"name":"Elastoplast Plasters (40)","price":39,"stock":80,"cat":"First Aid","rx":false},
    {"name":"Savlon Antiseptic Cream 30g","price":59,"stock":62,"cat":"First Aid","rx":false},
    {"name":"Burnshield Hydrogel 50ml","price":89,"stock":30,"cat":"First Aid","rx":false},
    {"name":"Metformin 500mg (30 tabs)","price":110,"stock":40,"cat":"Chronic","rx":true},
    {"name":"Atenolol 50mg (30 tabs)","price":95,"stock":35,"cat":"Chronic","rx":true},
    {"name":"Atorvastatin 20mg (30 tabs)","price":165,"stock":30,"cat":"Chronic","rx":true},
    {"name":"Ventolin Inhaler 200 doses","price":135,"stock":25,"cat":"Chronic","rx":true},
    {"name":"Amoxicillin 500mg (21 caps)","price":85,"stock":40,"cat":"Antibiotic","rx":true}
  ]'::jsonb;
  v_row jsonb;
  v_med jsonb;
  v_uid uuid;
  v_price_factor numeric;
  v_idx int := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_data) LOOP
    v_uid := (v_row->>'id')::uuid;
    v_idx := v_idx + 1;

    -- Insert auth.users (idempotent via ON CONFLICT)
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_row->>'email', crypt('Demo1234!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_row->>'contact', 'role', 'pharmacy'),
      false, '', '', '', ''
    ) ON CONFLICT (id) DO NOTHING;

    -- Profile
    INSERT INTO public.profiles (user_id, full_name, email, organization_name, phone, address, approval_status)
    VALUES (v_uid, v_row->>'contact', v_row->>'email', v_row->>'name', v_row->>'phone', v_row->>'address', 'approved')
    ON CONFLICT (user_id) DO UPDATE SET
      organization_name = EXCLUDED.organization_name,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address,
      approval_status = 'approved';

    -- Role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'pharmacy'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Inventory: each pharmacy gets a price-factor (0.9-1.15) and slightly different stock
    v_price_factor := 0.9 + (v_idx % 5) * 0.06;
    FOR v_med IN SELECT * FROM jsonb_array_elements(v_meds) LOOP
      INSERT INTO public.medications (pharmacy_id, name, price, stock_quantity, category, requires_prescription, description)
      VALUES (
        v_uid,
        v_med->>'name',
        round(((v_med->>'price')::numeric * v_price_factor) * 100) / 100,
        (v_med->>'stock')::int + (v_idx * 3),
        v_med->>'cat',
        (v_med->>'rx')::boolean,
        'Stocked at ' || (v_row->>'name')
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
