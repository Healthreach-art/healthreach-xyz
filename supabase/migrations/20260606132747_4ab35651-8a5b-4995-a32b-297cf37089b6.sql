ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS prescription_upload_id uuid REFERENCES public.prescription_uploads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_prescription_upload_id
  ON public.orders(prescription_upload_id)
  WHERE prescription_upload_id IS NOT NULL;