
DROP POLICY IF EXISTS "Anyone can view provider profiles" ON public.profiles;

DROP VIEW IF EXISTS public.pharmacy_directory;
DROP FUNCTION IF EXISTS public.get_pharmacy_directory();

CREATE OR REPLACE FUNCTION public.get_pharmacy_directory()
RETURNS TABLE (
  user_id uuid,
  organization_name text,
  full_name text,
  address text,
  phone text,
  latitude double precision,
  longitude double precision,
  services text[],
  services_tags text[],
  appointments_enabled boolean,
  walkins_enabled boolean,
  opening_hours text,
  approval_status approval_status,
  is_demo boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.organization_name, p.full_name, p.address, p.phone,
         p.latitude, p.longitude, p.services, p.services_tags,
         p.appointments_enabled, p.walkins_enabled, p.opening_hours,
         p.approval_status, p.is_demo, p.created_at
    FROM public.profiles p
   WHERE p.organization_name IS NOT NULL AND p.organization_name <> ''
     AND (p.approval_status = 'approved'::approval_status OR p.is_demo = true)
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id AND ur.role = 'pharmacy'::app_role
     );
$$;

GRANT EXECUTE ON FUNCTION public.get_pharmacy_directory() TO anon, authenticated;

CREATE VIEW public.pharmacy_directory
WITH (security_invoker = on) AS
SELECT * FROM public.get_pharmacy_directory();

GRANT SELECT ON public.pharmacy_directory TO anon, authenticated;
