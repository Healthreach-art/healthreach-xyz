DROP VIEW IF EXISTS public.pharmacy_directory;

CREATE VIEW public.pharmacy_directory
WITH (security_invoker = false) AS
SELECT
  user_id,
  organization_name,
  full_name,
  address,
  phone,
  latitude,
  longitude,
  services,
  services_tags,
  appointments_enabled,
  walkins_enabled,
  opening_hours,
  approval_status,
  is_demo,
  created_at
FROM public.profiles
WHERE organization_name IS NOT NULL
  AND organization_name <> ''
  AND (approval_status = 'approved' OR is_demo = true);

GRANT SELECT ON public.pharmacy_directory TO anon, authenticated;