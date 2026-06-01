-- 1. Extend profiles with patient personal & medical-aid info
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS medical_aid_provider text,
  ADD COLUMN IF NOT EXISTS medical_aid_plan text,
  ADD COLUMN IF NOT EXISTS medical_aid_member_number text,
  ADD COLUMN IF NOT EXISTS medical_aid_verification_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS medical_aid_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS medical_aid_notes text;

-- 2. Doctors table (each doctor belongs to a hospital profile)
CREATE TABLE IF NOT EXISTS public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  full_name text NOT NULL,
  specialty text NOT NULL DEFAULT 'General Practitioner',
  qualifications text NOT NULL DEFAULT '',
  practice_number text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  consultation_fee numeric NOT NULL DEFAULT 0,
  accepted_medical_aids text[] NOT NULL DEFAULT ARRAY[]::text[],
  languages text[] NOT NULL DEFAULT ARRAY['English']::text[],
  online_available boolean NOT NULL DEFAULT true,
  in_person_available boolean NOT NULL DEFAULT true,
  phone_available boolean NOT NULL DEFAULT false,
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  is_active boolean NOT NULL DEFAULT true,
  rating_avg numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.doctors TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.doctors TO authenticated;
GRANT ALL ON public.doctors TO service_role;

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated browse active doctors"
  ON public.doctors FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Hospital views own doctors"
  ON public.doctors FOR SELECT TO authenticated USING (hospital_id = auth.uid());

CREATE POLICY "Hospital manages own doctors"
  ON public.doctors FOR INSERT TO authenticated WITH CHECK (hospital_id = auth.uid());

CREATE POLICY "Hospital updates own doctors"
  ON public.doctors FOR UPDATE TO authenticated USING (hospital_id = auth.uid());

CREATE POLICY "Hospital deletes own doctors"
  ON public.doctors FOR DELETE TO authenticated USING (hospital_id = auth.uid());

CREATE POLICY "Admins manage all doctors"
  ON public.doctors FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER doctors_updated_at
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS doctors_hospital_idx ON public.doctors(hospital_id);
CREATE INDEX IF NOT EXISTS doctors_specialty_idx ON public.doctors(specialty);

-- 3. Doctor appointments
CREATE TABLE IF NOT EXISTS public.doctor_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  hospital_id uuid NOT NULL,
  family_member_id uuid,
  scheduled_at timestamptz NOT NULL,
  mode text NOT NULL DEFAULT 'in_person', -- in_person | video | phone
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- pending | confirmed | completed | cancelled | rescheduled
  consultation_fee numeric NOT NULL DEFAULT 0,
  platform_fee numeric NOT NULL DEFAULT 15,
  total_paid numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending', -- pending | paid | refunded
  payment_reference text,
  use_medical_aid boolean NOT NULL DEFAULT false,
  medical_aid_provider text,
  medical_aid_member_number text,
  doctor_notes text NOT NULL DEFAULT '',
  cancelled_at timestamptz,
  cancellation_reason text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.doctor_appointments TO authenticated;
GRANT ALL ON public.doctor_appointments TO service_role;

ALTER TABLE public.doctor_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient views own doctor appointments"
  ON public.doctor_appointments FOR SELECT TO authenticated USING (patient_id = auth.uid());
CREATE POLICY "Patient creates own doctor appointments"
  ON public.doctor_appointments FOR INSERT TO authenticated WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Patient updates own doctor appointments"
  ON public.doctor_appointments FOR UPDATE TO authenticated USING (patient_id = auth.uid());

CREATE POLICY "Hospital views their doctor appointments"
  ON public.doctor_appointments FOR SELECT TO authenticated USING (hospital_id = auth.uid());
CREATE POLICY "Hospital updates their doctor appointments"
  ON public.doctor_appointments FOR UPDATE TO authenticated USING (hospital_id = auth.uid());

CREATE POLICY "Admins manage all doctor appointments"
  ON public.doctor_appointments FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER doctor_appointments_updated_at
  BEFORE UPDATE ON public.doctor_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS doctor_appts_patient_idx ON public.doctor_appointments(patient_id);
CREATE INDEX IF NOT EXISTS doctor_appts_doctor_idx ON public.doctor_appointments(doctor_id);
CREATE INDEX IF NOT EXISTS doctor_appts_hospital_idx ON public.doctor_appointments(hospital_id);

-- Notify on doctor appointment status change
CREATE OR REPLACE FUNCTION public.notify_doctor_appointment_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.hospital_id, 'appointment', 'New doctor appointment request',
            'A patient booked an appointment. Open the dashboard to confirm.',
            '/dashboard/hospital');
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

CREATE TRIGGER doctor_appointments_notify
  AFTER INSERT OR UPDATE OF status ON public.doctor_appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_doctor_appointment_status_change();

-- 4. E-prescriptions issued by doctors
CREATE TABLE IF NOT EXISTS public.e_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  hospital_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'prescription', -- prescription | referral | sick_note
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  medication_name text,
  dosage text,
  instructions text,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.e_prescriptions TO authenticated;
GRANT ALL ON public.e_prescriptions TO service_role;

ALTER TABLE public.e_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient views own e-prescriptions"
  ON public.e_prescriptions FOR SELECT TO authenticated USING (patient_id = auth.uid());
CREATE POLICY "Hospital manages own e-prescriptions"
  ON public.e_prescriptions FOR ALL TO authenticated
  USING (hospital_id = auth.uid()) WITH CHECK (hospital_id = auth.uid());
CREATE POLICY "Admins manage all e-prescriptions"
  ON public.e_prescriptions FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER e_prescriptions_updated_at
  BEFORE UPDATE ON public.e_prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify patient when a prescription is issued
CREATE OR REPLACE FUNCTION public.notify_e_prescription_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, category, title, body, link)
  VALUES (NEW.patient_id, 'prescription',
          CASE NEW.kind WHEN 'referral' THEN 'New referral letter'
                        WHEN 'sick_note' THEN 'New sick note'
                        ELSE 'New e-prescription' END,
          COALESCE(NEW.title, NEW.medication_name, 'Document ready'),
          '/dashboard/patient/consultations');
  RETURN NEW;
END $$;

CREATE TRIGGER e_prescriptions_notify
  AFTER INSERT ON public.e_prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_e_prescription_created();

-- 5. Doctor reviews
CREATE TABLE IF NOT EXISTS public.doctor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  appointment_id uuid,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.doctor_reviews TO anon;
GRANT SELECT, INSERT ON public.doctor_reviews TO authenticated;
GRANT ALL ON public.doctor_reviews TO service_role;

ALTER TABLE public.doctor_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view doctor reviews" ON public.doctor_reviews FOR SELECT USING (true);
CREATE POLICY "Patient creates own doctor review"
  ON public.doctor_reviews FOR INSERT TO authenticated WITH CHECK (patient_id = auth.uid());

-- Recompute doctor rating
CREATE OR REPLACE FUNCTION public.recompute_doctor_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avg numeric; v_count integer;
BEGIN
  SELECT COALESCE(avg(stars),0), count(*) INTO v_avg, v_count
    FROM public.doctor_reviews WHERE doctor_id = NEW.doctor_id;
  UPDATE public.doctors SET rating_avg = round(v_avg,1), rating_count = v_count, updated_at = now()
    WHERE id = NEW.doctor_id;
  RETURN NEW;
END $$;

CREATE TRIGGER doctor_reviews_recompute
  AFTER INSERT ON public.doctor_reviews
  FOR EACH ROW EXECUTE FUNCTION public.recompute_doctor_rating();