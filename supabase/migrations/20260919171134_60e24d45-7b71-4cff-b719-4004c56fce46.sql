CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  requested_role text;
  meta_address text;
  meta_lat numeric;
  meta_lng numeric;
  meta_phone text;
  meta_org text;
  meta_hc_type text;
  chosen_role public.app_role;
BEGIN
  requested_role := NEW.raw_user_meta_data ->> 'role';
  meta_address := NULLIF(NEW.raw_user_meta_data ->> 'address', '');
  meta_phone := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');
  meta_org := NULLIF(NEW.raw_user_meta_data ->> 'organization_name', '');
  meta_hc_type := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'homecare_type', ''), 'company');
  BEGIN meta_lat := (NEW.raw_user_meta_data ->> 'lat')::numeric; EXCEPTION WHEN OTHERS THEN meta_lat := NULL; END;
  BEGIN meta_lng := (NEW.raw_user_meta_data ->> 'lng')::numeric; EXCEPTION WHEN OTHERS THEN meta_lng := NULL; END;

  IF requested_role IN ('patient', 'pharmacy', 'hospital', 'driver', 'doctor', 'homecare_company') THEN
    chosen_role := requested_role::public.app_role;
  ELSE
    chosen_role := 'patient'::public.app_role;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, email, address, latitude, longitude, phone, organization_name, approval_status, is_demo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    meta_address, meta_lat, meta_lng, meta_phone, meta_org,
    CASE WHEN chosen_role IN ('pharmacy'::public.app_role, 'hospital'::public.app_role, 'driver'::public.app_role,
                              'doctor'::public.app_role, 'homecare_company'::public.app_role)
      THEN 'pending'::public.approval_status
      ELSE 'approved'::public.approval_status
    END,
    false
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    phone = EXCLUDED.phone,
    organization_name = EXCLUDED.organization_name,
    approval_status = EXCLUDED.approval_status,
    is_demo = false;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, chosen_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF chosen_role = 'driver'::public.app_role AND meta_lat IS NOT NULL AND meta_lng IS NOT NULL THEN
    INSERT INTO public.driver_locations (driver_id, lat, lng, updated_at)
    VALUES (NEW.id, meta_lat, meta_lng, now())
    ON CONFLICT (driver_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = EXCLUDED.updated_at;
  END IF;

  IF chosen_role = 'homecare_company'::public.app_role THEN
    INSERT INTO public.homecare_providers (
      user_id, provider_type, business_name, full_name, email, phone, address, latitude, longitude
    ) VALUES (
      NEW.id,
      CASE WHEN meta_hc_type = 'individual' THEN 'individual' ELSE 'company' END,
      COALESCE(meta_org, ''),
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
      COALESCE(NEW.email, ''),
      meta_phone, meta_address, meta_lat, meta_lng
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;