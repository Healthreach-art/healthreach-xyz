-- 1. Extend approval_status enum
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'expired';

-- 2. Extend profiles for pharmacy regulatory fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS pharmacist_name text,
  ADD COLUMN IF NOT EXISTS pharmacist_council_number text,
  ADD COLUMN IF NOT EXISTS business_reg_number text,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS responsible_pharmacist_phone text,
  ADD COLUMN IF NOT EXISTS license_expires_at date;

-- 3. New pharmacy_documents table (mirrors driver_documents)
CREATE TABLE IF NOT EXISTS public.pharmacy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL UNIQUE,
  license_path text,
  pharmacist_cert_path text,
  business_reg_path text,
  tax_cert_path text,
  proof_of_address_path text,
  bank_confirmation_path text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_documents TO authenticated;
GRANT ALL ON public.pharmacy_documents TO service_role;

ALTER TABLE public.pharmacy_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pharmacies manage own docs"
  ON public.pharmacy_documents FOR ALL
  USING (auth.uid() = pharmacy_id)
  WITH CHECK (auth.uid() = pharmacy_id);

CREATE POLICY "Admins manage all pharmacy docs"
  ON public.pharmacy_documents FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pharmacy_documents_updated_at
  BEFORE UPDATE ON public.pharmacy_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Private storage bucket for pharmacy docs
INSERT INTO storage.buckets (id, name, public)
VALUES ('pharmacy-docs', 'pharmacy-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Pharmacies upload own docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pharmacy-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Pharmacies read own docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pharmacy-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Pharmacies update own docs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pharmacy-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins read all pharmacy docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pharmacy-docs' AND app_private.has_role(auth.uid(), 'admin'::app_role));

-- 5. License expiry sweep (call via cron or admin tool)
CREATE OR REPLACE FUNCTION public.expire_pharmacy_licenses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.profiles
     SET approval_status = 'expired',
         updated_at = now()
   WHERE approval_status = 'approved'
     AND license_expires_at IS NOT NULL
     AND license_expires_at < CURRENT_DATE
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = profiles.user_id AND ur.role = 'pharmacy'::app_role
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('expired', v_count);
END;
$$;