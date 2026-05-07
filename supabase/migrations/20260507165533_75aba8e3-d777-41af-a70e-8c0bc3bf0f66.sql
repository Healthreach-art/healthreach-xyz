-- Medication enhancements
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS batch_number TEXT;

-- Public bucket for medication images
INSERT INTO storage.buckets (id, name, public)
VALUES ('medication-images', 'medication-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Med images public read" ON storage.objects
    FOR SELECT USING (bucket_id = 'medication-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Pharmacies upload med images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'medication-images' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Pharmacies update own med images" ON storage.objects
    FOR UPDATE USING (bucket_id = 'medication-images' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Pharmacies delete own med images" ON storage.objects
    FOR DELETE USING (bucket_id = 'medication-images' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Prescription audit log
CREATE TABLE IF NOT EXISTS public.prescription_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_upload_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  action TEXT NOT NULL, -- viewed, approved, rejected, reupload_requested, flagged
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prescription_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Pharmacy view own audit"
    ON public.prescription_audit_log FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.prescription_uploads u
      WHERE u.id = prescription_upload_id AND u.pharmacy_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins view all audit"
    ON public.prescription_audit_log FOR SELECT
    USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Actor inserts audit"
    ON public.prescription_audit_log FOR INSERT
    WITH CHECK (auth.uid() = actor_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add a flagged status option via column (don't break enum); use boolean
ALTER TABLE public.prescription_uploads
  ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;