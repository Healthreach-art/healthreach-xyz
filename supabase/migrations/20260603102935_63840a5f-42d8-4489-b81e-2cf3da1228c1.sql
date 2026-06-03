
ALTER TABLE public.doctors
  ALTER COLUMN hospital_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

DROP POLICY IF EXISTS "Public can view active doctors" ON public.doctors;
DROP POLICY IF EXISTS "Public can view active verified doctors" ON public.doctors;
CREATE POLICY "Public can view active verified doctors" ON public.doctors
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND is_verified = true);

DROP POLICY IF EXISTS "Doctors can view own row" ON public.doctors;
CREATE POLICY "Doctors can view own row" ON public.doctors
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can update own row" ON public.doctors;
CREATE POLICY "Doctors can update own row" ON public.doctors
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can insert own row" ON public.doctors;
CREATE POLICY "Doctors can insert own row" ON public.doctors
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_verified = false);

DROP POLICY IF EXISTS "Admins can manage doctors" ON public.doctors;
CREATE POLICY "Admins can manage doctors" ON public.doctors
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.guard_doctor_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can change verification status';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_doctor_verification ON public.doctors;
CREATE TRIGGER trg_guard_doctor_verification BEFORE UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.guard_doctor_verification();

-- DOCTOR DOCUMENTS (new)
CREATE TABLE IF NOT EXISTS public.doctor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_user_id uuid NOT NULL UNIQUE,
  hpcsa_number text,
  hpcsa_cert_path text,
  id_document_path text,
  qualification_paths text[] NOT NULL DEFAULT '{}',
  malpractice_cert_path text,
  malpractice_expires_at date,
  practice_letter_path text,
  indemnity_path text,
  notes text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_documents TO authenticated;
GRANT ALL ON public.doctor_documents TO service_role;
ALTER TABLE public.doctor_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors manage their own documents" ON public.doctor_documents;
CREATE POLICY "Doctors manage their own documents" ON public.doctor_documents
  FOR ALL TO authenticated USING (doctor_user_id = auth.uid())
  WITH CHECK (doctor_user_id = auth.uid());
DROP POLICY IF EXISTS "Admins view all doctor documents" ON public.doctor_documents;
CREATE POLICY "Admins view all doctor documents" ON public.doctor_documents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins update doctor documents" ON public.doctor_documents;
CREATE POLICY "Admins update doctor documents" ON public.doctor_documents
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_doctor_docs_updated ON public.doctor_documents;
CREATE TRIGGER trg_doctor_docs_updated BEFORE UPDATE ON public.doctor_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend EXISTING pharmacy_documents
ALTER TABLE public.pharmacy_documents
  ADD COLUMN IF NOT EXISTS premises_license_number text,
  ADD COLUMN IF NOT EXISTS premises_license_expires_at date,
  ADD COLUMN IF NOT EXISTS responsible_pharmacist_name text,
  ADD COLUMN IF NOT EXISTS responsible_pharmacist_sapc text,
  ADD COLUMN IF NOT EXISTS service_certificates jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_services text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Booking gates
CREATE OR REPLACE FUNCTION public.guard_doctor_appointment_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_verified boolean; v_active boolean;
BEGIN
  SELECT is_verified, is_active INTO v_verified, v_active FROM public.doctors WHERE id = NEW.doctor_id;
  IF v_verified IS NULL THEN RAISE EXCEPTION 'Doctor not found'; END IF;
  IF NOT v_verified OR NOT v_active THEN
    RAISE EXCEPTION 'Doctor is not yet verified by HEALTHREACH — booking unavailable.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_doc_appt ON public.doctor_appointments;
CREATE TRIGGER trg_guard_doc_appt BEFORE INSERT ON public.doctor_appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_doctor_appointment_booking();

CREATE OR REPLACE FUNCTION public.guard_pharmacy_appointment_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_verified_at timestamptz; v_approval text;
BEGIN
  SELECT approval_status::text INTO v_approval FROM public.profiles WHERE user_id = NEW.pharmacy_id;
  IF v_approval IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Pharmacy is not approved.';
  END IF;
  SELECT verified_at INTO v_verified_at FROM public.pharmacy_documents WHERE pharmacy_id = NEW.pharmacy_id;
  IF v_verified_at IS NULL THEN
    RAISE EXCEPTION 'Pharmacy has not completed credential verification.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_pharm_appt ON public.pharmacy_appointments;
CREATE TRIGGER trg_guard_pharm_appt BEFORE INSERT ON public.pharmacy_appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_pharmacy_appointment_booking();

-- Allow 'doctor' in handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE requested_role text;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), COALESCE(NEW.email, ''));
  requested_role := NEW.raw_user_meta_data ->> 'role';
  IF requested_role IN ('patient', 'pharmacy', 'hospital', 'driver', 'doctor') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested_role::public.app_role);
    IF requested_role IN ('pharmacy', 'hospital', 'driver', 'doctor') THEN
      UPDATE public.profiles SET approval_status = 'pending' WHERE user_id = NEW.id;
    END IF;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'patient'::public.app_role);
  END IF;
  RETURN NEW;
END $$;
