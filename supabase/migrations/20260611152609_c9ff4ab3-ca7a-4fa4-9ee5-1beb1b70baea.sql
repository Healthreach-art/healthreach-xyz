UPDATE auth.users
SET encrypted_password = crypt('DemoPass!2025', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now(),
    banned_until = NULL,
    deleted_at = NULL
WHERE email IN (
  'patient.demo@healthreach.co.za',
  'pharmacy.demo@healthreach.co.za',
  'doctor.demo@healthreach.co.za',
  'driver.demo@healthreach.co.za'
);

UPDATE auth.users
SET encrypted_password = crypt('DemoAdmin!2025', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now(),
    banned_until = NULL,
    deleted_at = NULL
WHERE email = 'admin.demo@healthreach.co.za';