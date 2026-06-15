
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
  meta_address text;
  meta_lat numeric;
  meta_lng numeric;
  meta_phone text;
  meta_org text;
BEGIN
  requested_role := NEW.raw_user_meta_data ->> 'role';
  meta_address := NULLIF(NEW.raw_user_meta_data ->> 'address', '');
  meta_phone := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');
  meta_org := NULLIF(NEW.raw_user_meta_data ->> 'organization_name', '');
  BEGIN meta_lat := (NEW.raw_user_meta_data ->> 'lat')::numeric; EXCEPTION WHEN OTHERS THEN meta_lat := NULL; END;
  BEGIN meta_lng := (NEW.raw_user_meta_data ->> 'lng')::numeric; EXCEPTION WHEN OTHERS THEN meta_lng := NULL; END;

  INSERT INTO public.profiles (user_id, full_name, email, address, latitude, longitude, phone, organization_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    meta_address,
    meta_lat,
    meta_lng,
    meta_phone,
    meta_org
  );

  IF requested_role IN ('patient', 'pharmacy', 'hospital', 'driver', 'doctor') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested_role::public.app_role);
    IF requested_role IN ('pharmacy', 'hospital', 'driver', 'doctor') THEN
      UPDATE public.profiles
         SET approval_status = 'approved', is_demo = true
       WHERE user_id = NEW.id;
    END IF;
    IF requested_role = 'driver' AND meta_lat IS NOT NULL AND meta_lng IS NOT NULL THEN
      INSERT INTO public.driver_locations (driver_id, lat, lng, updated_at)
      VALUES (NEW.id, meta_lat, meta_lng, now())
      ON CONFLICT (driver_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = EXCLUDED.updated_at;
    END IF;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'patient'::public.app_role);
  END IF;
  RETURN NEW;
END $function$;
