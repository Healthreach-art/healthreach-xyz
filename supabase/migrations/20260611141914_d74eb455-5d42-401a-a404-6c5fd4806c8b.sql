
-- 1) Auto-flag new provider signups as demo + auto-approve their profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE requested_role text;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), COALESCE(NEW.email, ''));
  requested_role := NEW.raw_user_meta_data ->> 'role';
  IF requested_role IN ('patient', 'pharmacy', 'hospital', 'driver', 'doctor') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested_role::public.app_role);
    IF requested_role IN ('pharmacy', 'hospital', 'driver', 'doctor') THEN
      -- TESTING MODE: provider accounts auto-approved and flagged demo so they are bookable immediately
      UPDATE public.profiles
         SET approval_status = 'approved',
             is_demo = true
       WHERE user_id = NEW.id;
    END IF;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'patient'::public.app_role);
  END IF;
  RETURN NEW;
END $function$;

-- 2) Backfill all existing pharmacy/doctor/hospital/driver profiles
UPDATE public.profiles p
   SET is_demo = true,
       approval_status = 'approved'
 WHERE EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id
      AND ur.role IN ('pharmacy'::app_role,'doctor'::app_role,'hospital'::app_role,'driver'::app_role)
 );

-- 3) Backfill all existing doctors rows as demo + active + verified
UPDATE public.doctors
   SET is_demo = true,
       is_active = true,
       is_verified = true,
       verified_at = COALESCE(verified_at, now());

-- 4) Allow non-admin to set is_verified when the row is a demo doctor
CREATE OR REPLACE FUNCTION public.guard_doctor_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND COALESCE(NEW.is_demo, false) = false
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can change verification status';
  END IF;
  RETURN NEW;
END $function$;

-- 5) Skip publish-ready guard for demo doctors
CREATE OR REPLACE FUNCTION public.guard_doctor_publish_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_windows int;
BEGIN
  IF COALESCE(NEW.is_demo, false) = true THEN
    RETURN NEW;
  END IF;
  IF (NEW.is_verified IS TRUE AND COALESCE(OLD.is_verified, false) IS FALSE)
     OR (NEW.is_active IS TRUE AND COALESCE(OLD.is_active, false) IS FALSE) THEN
    IF NEW.photo_url IS NULL OR length(btrim(NEW.photo_url)) = 0 THEN
      RAISE EXCEPTION 'Doctor cannot be published: profile photo is required';
    END IF;
    IF NEW.full_name IS NULL OR length(btrim(NEW.full_name)) < 2 THEN
      RAISE EXCEPTION 'Doctor cannot be published: full name is required';
    END IF;
    IF NEW.specialty IS NULL OR length(btrim(NEW.specialty)) < 2 THEN
      RAISE EXCEPTION 'Doctor cannot be published: specialty is required';
    END IF;
    IF NEW.qualifications IS NULL OR length(btrim(NEW.qualifications)) < 2 THEN
      RAISE EXCEPTION 'Doctor cannot be published: qualifications are required';
    END IF;
    IF NEW.city IS NULL OR length(btrim(NEW.city)) < 2 THEN
      RAISE EXCEPTION 'Doctor cannot be published: city is required';
    END IF;
    IF NEW.consultation_fee IS NULL OR NEW.consultation_fee <= 0 THEN
      RAISE EXCEPTION 'Doctor cannot be published: consultation fee is required';
    END IF;
    SELECT count(*) INTO v_windows
      FROM public.doctor_availability
     WHERE doctor_id = NEW.id AND is_active = true;
    IF v_windows = 0 THEN
      RAISE EXCEPTION 'Doctor cannot be published: add at least one weekly availability window';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 6) Doctor appointment booking allowed when doctor is demo
CREATE OR REPLACE FUNCTION public.guard_doctor_appointment_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_verified boolean; v_active boolean; v_demo boolean;
BEGIN
  SELECT is_verified, is_active, COALESCE(is_demo,false)
    INTO v_verified, v_active, v_demo
    FROM public.doctors WHERE id = NEW.doctor_id;
  IF v_verified IS NULL THEN RAISE EXCEPTION 'Doctor not found'; END IF;
  IF v_demo THEN RETURN NEW; END IF;
  IF NOT v_verified OR NOT v_active THEN
    RAISE EXCEPTION 'Doctor is not yet verified by HEALTHREACH — booking unavailable.';
  END IF;
  RETURN NEW;
END $function$;

-- 7) Pharmacy appointment booking allowed when pharmacy profile is demo
CREATE OR REPLACE FUNCTION public.guard_pharmacy_appointment_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_verified_at timestamptz; v_approval text; v_demo boolean;
BEGIN
  SELECT approval_status::text, COALESCE(is_demo,false)
    INTO v_approval, v_demo
    FROM public.profiles WHERE user_id = NEW.pharmacy_id;
  IF v_demo THEN RETURN NEW; END IF;
  IF v_approval IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Pharmacy is not approved.';
  END IF;
  SELECT MAX(verified_at) INTO v_verified_at FROM public.pharmacy_documents WHERE pharmacy_id = NEW.pharmacy_id;
  IF v_verified_at IS NULL THEN
    RAISE EXCEPTION 'Pharmacy has not completed credential verification.';
  END IF;
  RETURN NEW;
END $function$;
