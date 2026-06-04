CREATE OR REPLACE FUNCTION public.notify_doctor_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO doc_user_id FROM public.doctors WHERE id = NEW.doctor_id;

    -- Notify the doctor directly (works for self-registered doctors)
    IF doc_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, category, title, body, link)
      VALUES (doc_user_id, 'appointment', 'New appointment request',
              'A patient booked an appointment with you. Open your dashboard to confirm.',
              '/dashboard/doctor');
    END IF;

    -- Also notify the hospital if it is a different account
    IF NEW.hospital_id IS NOT NULL AND NEW.hospital_id IS DISTINCT FROM doc_user_id THEN
      INSERT INTO public.notifications (user_id, category, title, body, link)
      VALUES (NEW.hospital_id, 'appointment', 'New doctor appointment request',
              'A patient booked an appointment. Open the dashboard to confirm.',
              '/dashboard/hospital');
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
END;
$$;