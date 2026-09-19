-- Keep home care banking fields unreadable through the Data API
REVOKE SELECT (bank_name, account_holder, account_number, branch_code) ON public.homecare_providers FROM authenticated;
REVOKE SELECT (bank_name, account_holder, account_number, branch_code) ON public.homecare_providers FROM anon;

-- Permanent admin account: jasonbayman@gmail.com
UPDATE auth.users
SET encrypted_password = extensions.crypt('Fransiena@10', extensions.gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email IN ('jasonbayman@gmail.com', 'jasonbayman5@gmail.com');

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role FROM auth.users u
WHERE u.email IN ('jasonbayman@gmail.com', 'jasonbayman5@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles p
SET approval_status = 'approved'
FROM auth.users u
WHERE p.user_id = u.id AND u.email IN ('jasonbayman@gmail.com', 'jasonbayman5@gmail.com');