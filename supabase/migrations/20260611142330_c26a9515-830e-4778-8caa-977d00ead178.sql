
-- 1) Reset known demo accounts to a single shared password
UPDATE auth.users
   SET encrypted_password = crypt('DemoPass!2025', gen_salt('bf')),
       email_confirmed_at = COALESCE(email_confirmed_at, now()),
       updated_at = now()
 WHERE email IN (
   'patient.demo@healthreach.co.za',
   'pharmacy.demo@healthreach.co.za',
   'doctor.demo@healthreach.co.za',
   'driver.demo@healthreach.co.za'
 );

-- 2) Create admin demo user if missing
DO $$
DECLARE v_admin_id uuid := '55555555-5555-5555-5555-555555555555';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin.demo@healthreach.co.za') THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated', 'admin.demo@healthreach.co.za', crypt('DemoAdmin!2025', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Demo Admin","role":"admin"}'::jsonb, now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'admin.demo@healthreach.co.za'), 'email', v_admin_id::text, now(), now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt('DemoAdmin!2025', gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE email = 'admin.demo@healthreach.co.za';
  END IF;

  -- Ensure profile + admin role exist
  INSERT INTO public.profiles (user_id, full_name, email, approval_status)
  VALUES (v_admin_id, 'Demo Admin', 'admin.demo@healthreach.co.za', 'approved')
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, approval_status = 'approved';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
