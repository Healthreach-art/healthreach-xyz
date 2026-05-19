
-- Patient identity verification (selfie + ID) required to order Rx medication
CREATE TABLE IF NOT EXISTS public.patient_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  id_document_path text,
  selfie_path text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own verification"
  ON public.patient_verifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all verifications"
  ON public.patient_verifications FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacies view verification of their patients"
  ON public.patient_verifications FOR SELECT
  USING (
    app_private.has_role(auth.uid(), 'pharmacy'::app_role) AND
    EXISTS (SELECT 1 FROM public.orders o WHERE o.patient_id = patient_verifications.user_id AND o.pharmacy_id = auth.uid())
  );

CREATE TRIGGER trg_patient_verifications_updated
  BEFORE UPDATE ON public.patient_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
