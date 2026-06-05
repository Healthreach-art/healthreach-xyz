
-- 1. Make pharmacy booking guard tolerant of multiple document rows
CREATE OR REPLACE FUNCTION public.guard_pharmacy_appointment_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_verified_at timestamptz; v_approval text;
BEGIN
  SELECT approval_status::text INTO v_approval FROM public.profiles WHERE user_id = NEW.pharmacy_id;
  IF v_approval IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Pharmacy is not approved.';
  END IF;
  SELECT MAX(verified_at) INTO v_verified_at FROM public.pharmacy_documents WHERE pharmacy_id = NEW.pharmacy_id;
  IF v_verified_at IS NULL THEN
    RAISE EXCEPTION 'Pharmacy has not completed credential verification.';
  END IF;
  RETURN NEW;
END $$;

-- 2. Doctor appointment notifications with patient name, time, link
CREATE OR REPLACE FUNCTION public.notify_doctor_appointment_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  doc_user_id uuid;
  patient_name text;
  when_str text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO doc_user_id FROM public.doctors WHERE id = NEW.doctor_id;
    SELECT COALESCE(full_name, 'A patient') INTO patient_name FROM public.profiles WHERE user_id = NEW.patient_id;
    when_str := to_char(NEW.scheduled_at, 'DD Mon YYYY HH24:MI');

    IF doc_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, category, title, body, link)
      VALUES (doc_user_id, 'appointment',
              'New appointment request from ' || patient_name,
              patient_name || ' booked for ' || when_str || '. Tap to accept or decline.',
              '/dashboard/doctor?appt=' || NEW.id::text);
    END IF;

    IF NEW.hospital_id IS NOT NULL AND NEW.hospital_id IS DISTINCT FROM doc_user_id THEN
      INSERT INTO public.notifications (user_id, category, title, body, link)
      VALUES (NEW.hospital_id, 'appointment',
              'New doctor appointment request from ' || patient_name,
              patient_name || ' booked for ' || when_str || '. Tap to accept or decline.',
              '/dashboard/hospital?appt=' || NEW.id::text);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.patient_id, 'appointment',
            'Doctor appointment ' || NEW.status,
            'Your appointment on ' || to_char(NEW.scheduled_at, 'DD Mon YYYY HH24:MI') || ' is ' || NEW.status || '.',
            '/dashboard/patient/consultations');
  END IF;
  RETURN NEW;
END $$;

-- 3. Pharmacy appointment notifications
CREATE OR REPLACE FUNCTION public.notify_pharmacy_appointment_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  patient_name text;
  when_str text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(full_name, 'A patient') INTO patient_name FROM public.profiles WHERE user_id = NEW.patient_id;
    when_str := to_char(NEW.preferred_at, 'DD Mon YYYY HH24:MI');
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.pharmacy_id, 'appointment',
            'New appointment request from ' || patient_name,
            patient_name || ' booked for ' || when_str || '. Tap to accept or decline.',
            '/dashboard/pharmacy?appt=' || NEW.id::text);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.patient_id, 'appointment',
            'Pharmacy appointment ' || NEW.status,
            'Your appointment on ' || to_char(NEW.preferred_at, 'DD Mon YYYY HH24:MI') || ' is ' || NEW.status || '.',
            '/dashboard/patient/consultations');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_pharmacy_appt ON public.pharmacy_appointments;
CREATE TRIGGER trg_notify_pharmacy_appt
  AFTER INSERT OR UPDATE ON public.pharmacy_appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_pharmacy_appointment_status_change();
