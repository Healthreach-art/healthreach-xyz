
CREATE TABLE IF NOT EXISTS public.pharmacy_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Branch',
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  phone text DEFAULT '',
  service_radius_km integer NOT NULL DEFAULT 60,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_branches_pharmacy ON public.pharmacy_branches(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_branches_loc ON public.pharmacy_branches(latitude, longitude);

ALTER TABLE public.pharmacy_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view branches"
  ON public.pharmacy_branches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Pharmacies manage own branches"
  ON public.pharmacy_branches FOR ALL
  USING (auth.uid() = pharmacy_id)
  WITH CHECK (auth.uid() = pharmacy_id);

CREATE POLICY "Admins manage all branches"
  ON public.pharmacy_branches FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_pharmacy_branches_updated
  BEFORE UPDATE ON public.pharmacy_branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ensure_single_primary_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.pharmacy_branches
       SET is_primary = false
     WHERE pharmacy_id = NEW.pharmacy_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pharmacy_branches_primary
  BEFORE INSERT OR UPDATE ON public.pharmacy_branches
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_primary_branch();

CREATE OR REPLACE FUNCTION public.find_pharmacies_near(_lat double precision, _lng double precision, _max_km integer)
 RETURNS TABLE(pharmacy_id uuid, organization_name text, distance_km double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH main AS (
    SELECT p.user_id AS pharmacy_id,
           COALESCE(p.organization_name, p.full_name) AS organization_name,
           public.haversine_km(_lat, _lng, p.latitude, p.longitude) AS distance_km
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'pharmacy'::app_role
     WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
       AND p.approval_status = 'approved'
  ),
  branches AS (
    SELECT b.pharmacy_id,
           COALESCE(p.organization_name, p.full_name) AS organization_name,
           public.haversine_km(_lat, _lng, b.latitude, b.longitude) AS distance_km
      FROM public.pharmacy_branches b
      JOIN public.profiles p ON p.user_id = b.pharmacy_id
     WHERE b.is_active = true
       AND p.approval_status = 'approved'
  ),
  combined AS (
    SELECT * FROM main
    UNION ALL
    SELECT * FROM branches
  )
  SELECT pharmacy_id, MAX(organization_name) AS organization_name, MIN(distance_km) AS distance_km
    FROM combined
   WHERE distance_km <= _max_km
   GROUP BY pharmacy_id
   ORDER BY distance_km ASC;
$function$;
