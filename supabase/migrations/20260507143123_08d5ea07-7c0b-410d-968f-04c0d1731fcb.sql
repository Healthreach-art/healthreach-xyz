
-- Status enum
DO $$ BEGIN
  CREATE TYPE public.prescription_upload_status AS ENUM ('pending','approved','rejected','expired','reupload_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.prescription_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  pharmacy_id uuid NOT NULL,
  order_id uuid,
  medication_id uuid,
  file_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  status public.prescription_upload_status NOT NULL DEFAULT 'pending',
  pharmacist_notes text DEFAULT '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presc_uploads_patient ON public.prescription_uploads(patient_id);
CREATE INDEX IF NOT EXISTS idx_presc_uploads_pharmacy ON public.prescription_uploads(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_presc_uploads_order ON public.prescription_uploads(order_id);
CREATE INDEX IF NOT EXISTS idx_presc_uploads_status ON public.prescription_uploads(status);

ALTER TABLE public.prescription_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients view own prescription uploads"
  ON public.prescription_uploads FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Pharmacies view assigned prescription uploads"
  ON public.prescription_uploads FOR SELECT
  USING (auth.uid() = pharmacy_id);

CREATE POLICY "Admins view all prescription uploads"
  ON public.prescription_uploads FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Patients insert own prescription uploads"
  ON public.prescription_uploads FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patients update own pending uploads"
  ON public.prescription_uploads FOR UPDATE
  USING (auth.uid() = patient_id AND status IN ('pending','reupload_requested'));

CREATE POLICY "Pharmacies update assigned uploads"
  ON public.prescription_uploads FOR UPDATE
  USING (auth.uid() = pharmacy_id);

CREATE POLICY "Admins manage all prescription uploads"
  ON public.prescription_uploads FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_presc_uploads_updated
  BEFORE UPDATE ON public.prescription_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-expire helper (90 day default)
CREATE OR REPLACE FUNCTION public.set_prescription_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (NEW.expires_at IS NULL) THEN
    NEW.expires_at := now() + interval '90 days';
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_presc_uploads_expiry
  BEFORE UPDATE ON public.prescription_uploads
  FOR EACH ROW EXECUTE FUNCTION public.set_prescription_expiry();

-- Notify on status change
CREATE OR REPLACE FUNCTION public.notify_prescription_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.patient_id, 'prescription',
            'Prescription ' || NEW.status::text,
            CASE NEW.status::text
              WHEN 'approved' THEN 'Your prescription was approved. You can proceed to payment.'
              WHEN 'rejected' THEN 'Your prescription was rejected.' || COALESCE(' Reason: '||NEW.pharmacist_notes,'')
              WHEN 'reupload_requested' THEN 'Pharmacy requested a re-upload of your prescription.'
              WHEN 'expired' THEN 'Your prescription has expired.'
              ELSE 'Status: ' || NEW.status::text
            END,
            '/dashboard/patient#prescriptions');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_presc_uploads_notify
  AFTER UPDATE ON public.prescription_uploads
  FOR EACH ROW EXECUTE FUNCTION public.notify_prescription_status_change();

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions','prescriptions', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: file paths use {patient_id}/{filename}
CREATE POLICY "Patients upload own prescription files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prescriptions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Patients view own prescription files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Pharmacies view assigned prescription files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND EXISTS (
      SELECT 1 FROM public.prescription_uploads pu
      WHERE pu.file_path = storage.objects.name AND pu.pharmacy_id = auth.uid()
    )
  );

CREATE POLICY "Admins view all prescription files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescriptions' AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Patients delete own pending prescription files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
