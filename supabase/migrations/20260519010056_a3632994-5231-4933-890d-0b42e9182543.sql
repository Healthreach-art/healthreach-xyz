-- Allow prescription uploads to live in a personal library (no pharmacy yet)
ALTER TABLE public.prescription_uploads
  ALTER COLUMN pharmacy_id DROP NOT NULL;

-- Patients can pick which pharmacy to send to later (or leave null = library)
-- Existing RLS already keys pharmacy view on pharmacy_id = auth.uid(), so null rows
-- are correctly invisible to pharmacies until claimed.

-- Helper: claim a personal prescription for a pharmacy at order time.
-- Idempotent — if it already belongs to that pharmacy, no-op. If it belongs to a
-- different pharmacy, raises.
CREATE OR REPLACE FUNCTION public.claim_prescription_for_pharmacy(
  _upload_id uuid,
  _pharmacy_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient uuid;
  v_existing uuid;
BEGIN
  SELECT patient_id, pharmacy_id INTO v_patient, v_existing
  FROM public.prescription_uploads
  WHERE id = _upload_id;

  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Prescription not found';
  END IF;
  IF v_patient <> auth.uid() THEN
    RAISE EXCEPTION 'Not your prescription';
  END IF;

  IF v_existing IS NULL THEN
    UPDATE public.prescription_uploads
      SET pharmacy_id = _pharmacy_id, updated_at = now()
      WHERE id = _upload_id;
  ELSIF v_existing <> _pharmacy_id THEN
    RAISE EXCEPTION 'Prescription already assigned to another pharmacy';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_prescription_for_pharmacy(uuid, uuid) TO authenticated;