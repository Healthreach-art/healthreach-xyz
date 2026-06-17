ALTER TABLE public.pharmacy_documents
  ADD COLUMN IF NOT EXISTS document_reviews jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.pharmacy_documents.document_reviews IS
  'Per-document admin review map: { "<doc_key>": { "status": "approved|rejected|under_review", "notes": "text", "reviewed_at": "iso", "reviewed_by": "uuid" } }';

-- Allow pharmacy to clear a single document's review when re-uploading.
-- Called by the owning pharmacy. Clears that key in document_reviews and refreshes submitted_at.
CREATE OR REPLACE FUNCTION public.pharmacy_resubmit_document(_doc_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _doc_key NOT IN (
    'license_path','pharmacist_cert_path','business_reg_path',
    'tax_cert_path','proof_of_address_path','bank_confirmation_path'
  ) THEN
    RAISE EXCEPTION 'Invalid doc key';
  END IF;
  UPDATE public.pharmacy_documents
     SET document_reviews = document_reviews - _doc_key,
         submitted_at = now(),
         reviewed_at = NULL,
         updated_at = now()
   WHERE pharmacy_id = v_uid;

  -- Also flip overall approval back to under_review so admins re-check
  UPDATE public.profiles
     SET approval_status = 'under_review', updated_at = now()
   WHERE user_id = v_uid
     AND approval_status IN ('rejected','suspended','expired','approved','under_review','pending');

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.pharmacy_resubmit_document(text) TO authenticated;

-- Admin sets per-document review status.
CREATE OR REPLACE FUNCTION public.admin_set_pharmacy_document_review(
  _pharmacy_id uuid,
  _doc_key text,
  _status text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_entry jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF _doc_key NOT IN (
    'license_path','pharmacist_cert_path','business_reg_path',
    'tax_cert_path','proof_of_address_path','bank_confirmation_path'
  ) THEN
    RAISE EXCEPTION 'Invalid doc key';
  END IF;
  IF _status NOT IN ('approved','rejected','under_review') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  v_entry := jsonb_build_object(
    'status', _status,
    'notes', COALESCE(_notes,''),
    'reviewed_at', to_jsonb(now()),
    'reviewed_by', to_jsonb(auth.uid())
  );

  INSERT INTO public.pharmacy_documents (pharmacy_id, document_reviews)
  VALUES (_pharmacy_id, jsonb_build_object(_doc_key, v_entry))
  ON CONFLICT (pharmacy_id) DO UPDATE
    SET document_reviews = COALESCE(public.pharmacy_documents.document_reviews,'{}'::jsonb) || jsonb_build_object(_doc_key, v_entry),
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'entry', v_entry);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_pharmacy_document_review(uuid,text,text,text) TO authenticated;