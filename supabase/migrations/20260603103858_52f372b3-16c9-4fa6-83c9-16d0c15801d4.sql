DO $$
DECLARE
  v_doctor_id uuid := '44444444-4444-4444-4444-444444444444';
BEGIN
  DELETE FROM auth.identities WHERE user_id = v_doctor_id;
  DELETE FROM auth.users WHERE id = v_doctor_id;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000', v_doctor_id, 'authenticated', 'authenticated', 'doctor.demo@healthreach.co.za', crypt('DemoDoctor!2025', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Dr. Demo Mokoena","role":"doctor"}'::jsonb, now(), now(), '', '', '', '');

  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_doctor_id::text, v_doctor_id, jsonb_build_object('sub', v_doctor_id::text, 'email', 'doctor.demo@healthreach.co.za', 'email_verified', true), 'email', now(), now(), now());

  INSERT INTO public.profiles (user_id, full_name, email, organization_name, phone, address, approval_status)
  VALUES (v_doctor_id, 'Dr. Demo Mokoena', 'doctor.demo@healthreach.co.za', 'Demo Family Practice', '+27 11 000 0004', '88 Demo Avenue, Rosebank, Johannesburg', 'approved')
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, organization_name = EXCLUDED.organization_name, phone = EXCLUDED.phone, address = EXCLUDED.address, approval_status = 'approved';

  INSERT INTO public.user_roles (user_id, role) VALUES (v_doctor_id, 'doctor')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Verified credentials so bookings are allowed
  INSERT INTO public.doctor_documents (doctor_user_id, hpcsa_number, hpcsa_cert_path, id_document_path, qualification_paths, malpractice_cert_path, malpractice_expires_at, submitted_at, verified_at)
  VALUES (v_doctor_id, 'MP0123456', 'demo/hpcsa.pdf', 'demo/id.pdf', ARRAY['demo/mbchb.pdf'], 'demo/malpractice.pdf', (now() + interval '1 year')::date, now(), now())
  ON CONFLICT (doctor_user_id) DO UPDATE SET verified_at = now(), rejection_reason = NULL;

  -- Public doctor profile (verified & active)
  INSERT INTO public.doctors (user_id, full_name, specialty, qualifications, practice_number, bio, consultation_fee, accepted_medical_aids, languages, online_available, in_person_available, phone_available, city, address, is_active, is_verified, verified_at)
  VALUES (v_doctor_id, 'Dr. Demo Mokoena', 'General Practitioner', 'MBChB (Wits), Dip. Family Medicine', 'MP0123456',
    'Demo general practitioner serving Johannesburg. Friendly, evidence-based primary care for the whole family.',
    450.00, ARRAY['Discovery Health','Bonitas','Momentum','Medihelp'], ARRAY['English','isiZulu','Sesotho'],
    true, true, true, 'Johannesburg', '88 Demo Avenue, Rosebank, Johannesburg', true, true, now())
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name, specialty = EXCLUDED.specialty, qualifications = EXCLUDED.qualifications,
    bio = EXCLUDED.bio, consultation_fee = EXCLUDED.consultation_fee,
    accepted_medical_aids = EXCLUDED.accepted_medical_aids, languages = EXCLUDED.languages,
    city = EXCLUDED.city, address = EXCLUDED.address, is_active = true, is_verified = true, verified_at = now();
END $$;