
-- 1. Extend ratings for doctor + appointment support
ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_target_type_check;
ALTER TABLE public.ratings ADD CONSTRAINT ratings_target_type_check
  CHECK (target_type IN ('pharmacy','driver','doctor'));

ALTER TABLE public.ratings ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS appointment_id uuid;
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS appointment_type text;

ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_source_required;
ALTER TABLE public.ratings ADD CONSTRAINT ratings_source_required
  CHECK (order_id IS NOT NULL OR appointment_id IS NOT NULL);

DROP INDEX IF EXISTS public.ratings_unique_per_order_target_patient;
ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_order_id_target_type_patient_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ratings_unique_order
  ON public.ratings (order_id, target_type, patient_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ratings_unique_appointment
  ON public.ratings (appointment_id, target_type, patient_id) WHERE appointment_id IS NOT NULL;

-- 2. Pharmacy can view a patient's other prescription uploads if that patient has an order with them
DROP POLICY IF EXISTS "Pharmacy view patient uploads via order link" ON public.prescription_uploads;
CREATE POLICY "Pharmacy view patient uploads via order link"
  ON public.prescription_uploads FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'pharmacy'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.patient_id = prescription_uploads.patient_id
        AND o.pharmacy_id = auth.uid()
    )
  );

-- 3. Make doctor_appointments / pharmacy_appointments updates broadcast for the rating-prompt subscriber
ALTER TABLE public.doctor_appointments REPLICA IDENTITY FULL;
ALTER TABLE public.pharmacy_appointments REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_appointments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_appointments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
