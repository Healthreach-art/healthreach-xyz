CREATE OR REPLACE VIEW public.pharmacy_directory
WITH (security_invoker=on) AS
SELECT p.user_id, p.organization_name, p.full_name, p.address, p.phone,
       p.latitude, p.longitude, p.services, p.services_tags,
       p.appointments_enabled, p.walkins_enabled, p.opening_hours,
       p.approval_status, p.is_demo, p.created_at
FROM public.profiles p
WHERE p.organization_name IS NOT NULL
  AND p.organization_name <> ''
  AND (p.approval_status = 'approved'::approval_status OR p.is_demo = true)
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id AND ur.role = 'pharmacy'::app_role
  );

GRANT SELECT ON public.pharmacy_directory TO anon, authenticated;