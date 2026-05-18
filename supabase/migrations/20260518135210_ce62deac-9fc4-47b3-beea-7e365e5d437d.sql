
-- Repeats, fraud scoring, dispense lock for prescription_uploads
ALTER TABLE public.prescription_uploads
  ADD COLUMN IF NOT EXISTS repeats_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeats_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dispense_token text,
  ADD COLUMN IF NOT EXISTS dispensed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispensed_by uuid,
  ADD COLUMN IF NOT EXISTS last_dispensed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS prescription_uploads_dispense_token_uidx
  ON public.prescription_uploads(dispense_token) WHERE dispense_token IS NOT NULL;

-- On insert: deterministic demo fraud heuristic from patient + file path
CREATE OR REPLACE FUNCTION public.score_prescription_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h int;
  signals jsonb := '[]'::jsonb;
  score int := 0;
  dup_count int;
BEGIN
  -- Duplicate file_path basename check (signal of re-upload abuse)
  SELECT count(*) INTO dup_count FROM public.prescription_uploads
    WHERE patient_id = NEW.patient_id AND id <> NEW.id
      AND created_at > now() - interval '30 days';
  IF dup_count >= 3 THEN
    score := score + 25;
    signals := signals || jsonb_build_array(jsonb_build_object('label','high_volume','detail', dup_count || ' uploads in 30 days'));
  END IF;

  -- PDF without signature page is slightly higher risk (heuristic)
  IF NEW.mime_type = 'application/pdf' THEN
    score := score + 5;
    signals := signals || jsonb_build_array(jsonb_build_object('label','pdf_source','detail','PDF source — verify signature'));
  END IF;

  -- Deterministic pseudo-randomness for demo variety
  h := (abs(hashtext(NEW.patient_id::text || NEW.file_path)) % 30);
  score := score + h;

  IF score >= 60 THEN
    signals := signals || jsonb_build_array(jsonb_build_object('label','high_risk','detail','Manual review recommended'));
  END IF;

  NEW.fraud_score := LEAST(score, 100);
  NEW.fraud_signals := signals;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_score_prescription_on_insert ON public.prescription_uploads;
CREATE TRIGGER trg_score_prescription_on_insert
  BEFORE INSERT ON public.prescription_uploads
  FOR EACH ROW EXECUTE FUNCTION public.score_prescription_on_insert();

-- Default repeats_total to 5 when pharmacist approves (if not set)
CREATE OR REPLACE FUNCTION public.set_prescription_repeats_on_approve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    IF NEW.repeats_total = 0 THEN
      NEW.repeats_total := 5;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_repeats_on_approve ON public.prescription_uploads;
CREATE TRIGGER trg_set_repeats_on_approve
  BEFORE UPDATE ON public.prescription_uploads
  FOR EACH ROW EXECUTE FUNCTION public.set_prescription_repeats_on_approve();

-- Consume one repeat + issue dispense token. Returns token text.
CREATE OR REPLACE FUNCTION public.consume_prescription_repeat(_upload_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_rec public.prescription_uploads%ROWTYPE;
  new_token text;
BEGIN
  SELECT * INTO row_rec FROM public.prescription_uploads WHERE id = _upload_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prescription not found'; END IF;
  IF row_rec.patient_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized to consume this prescription';
  END IF;
  IF row_rec.status <> 'approved' THEN
    RAISE EXCEPTION 'Prescription is not approved';
  END IF;
  IF row_rec.expires_at IS NOT NULL AND row_rec.expires_at < now() THEN
    RAISE EXCEPTION 'Prescription expired';
  END IF;
  IF row_rec.repeats_total > 0 AND row_rec.repeats_used >= row_rec.repeats_total THEN
    RAISE EXCEPTION 'No repeats remaining — doctor renewal required';
  END IF;

  new_token := 'RX-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  UPDATE public.prescription_uploads
     SET repeats_used = repeats_used + 1,
         dispense_token = new_token,
         last_dispensed_at = now(),
         dispensed_at = COALESCE(dispensed_at, now()),
         dispensed_by = auth.uid(),
         updated_at = now()
   WHERE id = _upload_id;

  INSERT INTO public.prescription_audit_log (prescription_upload_id, actor_id, action, notes)
  VALUES (_upload_id, auth.uid(), 'dispensed', 'token=' || new_token);

  RETURN new_token;
END $$;

GRANT EXECUTE ON FUNCTION public.consume_prescription_repeat(uuid) TO authenticated;
