
-- Ensure profiles and admin role for the two admin accounts
INSERT INTO public.profiles (user_id, full_name, email, approval_status)
VALUES
  ('cebf370a-2570-4346-a5ad-0b99afae23b2', 'Admin', 'hlawumal@gmail.com', 'approved'),
  ('655233d1-ff29-44cb-9043-aa853ac4c8e2', 'Admin', 'jasonbayman5@gmail.com', 'approved')
ON CONFLICT (user_id) DO UPDATE SET approval_status = 'approved', email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('cebf370a-2570-4346-a5ad-0b99afae23b2', 'admin'),
  ('655233d1-ff29-44cb-9043-aa853ac4c8e2', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Remove any non-admin role rows for these users (so role lookup returns admin)
DELETE FROM public.user_roles
WHERE user_id IN ('cebf370a-2570-4346-a5ad-0b99afae23b2','655233d1-ff29-44cb-9043-aa853ac4c8e2')
  AND role <> 'admin';
