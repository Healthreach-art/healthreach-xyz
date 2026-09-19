ALTER TABLE public.homecare_providers
  ADD COLUMN IF NOT EXISTS service_radius_km integer NOT NULL DEFAULT 25;

DROP FUNCTION IF EXISTS public.find_homecare_near(double precision, double precision, integer);

CREATE FUNCTION public.find_homecare_near(_lat double precision, _lng double precision, _max_km integer DEFAULT 25)
 RETURNS TABLE(id uuid, provider_type text, display_name text, city text, address text, services text[], service_areas text[], hourly_rate numeric, operating_hours text, latitude double precision, longitude double precision, service_radius_km integer, distance_km double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.provider_type,
         COALESCE(NULLIF(p.business_name, ''), p.full_name, '') AS display_name,
         COALESCE(split_part(p.address, ',', 1), '') AS city,
         p.address, p.services, p.service_areas, p.hourly_rate, p.operating_hours,
         p.latitude, p.longitude, p.service_radius_km,
         round(public.haversine_km(_lat, _lng, p.latitude, p.longitude)::numeric, 1)::double precision AS distance_km
  FROM public.homecare_providers p
  WHERE p.approval_status = 'approved' AND p.is_active = true
    AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    AND public.haversine_km(_lat, _lng, p.latitude, p.longitude) <= LEAST(_max_km, COALESCE(p.service_radius_km, _max_km))
  ORDER BY distance_km;
$function$;