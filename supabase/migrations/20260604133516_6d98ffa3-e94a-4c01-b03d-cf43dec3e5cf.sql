
CREATE OR REPLACE FUNCTION public.guard_doctor_publish_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_windows int;
BEGIN
  -- Only enforce when the row is being turned on (verified or active)
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
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_doctor_publish_ready ON public.doctors;
CREATE TRIGGER trg_guard_doctor_publish_ready
BEFORE UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.guard_doctor_publish_ready();
