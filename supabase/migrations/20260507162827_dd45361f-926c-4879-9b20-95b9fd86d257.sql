
-- Driver onboarding documents
CREATE TABLE public.driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE,
  id_document_path TEXT,
  license_path TEXT,
  selfie_path TEXT,
  vehicle_photo_path TEXT,
  vehicle_type TEXT DEFAULT 'Motorbike',
  vehicle_registration TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  review_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers manage own docs" ON public.driver_documents
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Admins manage all driver docs" ON public.driver_documents
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_driver_documents_updated_at
  BEFORE UPDATE ON public.driver_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private bucket for driver verification documents
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-docs', 'driver-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Drivers upload own driver-docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Drivers view own driver-docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'driver-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Drivers update own driver-docs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Drivers delete own driver-docs" ON storage.objects
  FOR DELETE USING (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Pickup verification code on deliveries
ALTER TABLE public.deliveries
  ADD COLUMN pickup_code TEXT,
  ADD COLUMN pickup_verified_at TIMESTAMPTZ;

-- Auto-generate pickup code on insert
CREATE OR REPLACE FUNCTION public.generate_pickup_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pickup_code IS NULL THEN
    NEW.pickup_code := lpad((floor(random() * 10000))::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER deliveries_pickup_code_trigger
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.generate_pickup_code();

-- Backfill existing deliveries
UPDATE public.deliveries SET pickup_code = lpad((floor(random() * 10000))::text, 4, '0') WHERE pickup_code IS NULL;

-- Driver payouts / wallet
CREATE TABLE public.driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, paid, failed
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view own payouts" ON public.driver_payouts
  FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers request payouts" ON public.driver_payouts
  FOR INSERT WITH CHECK (auth.uid() = driver_id AND status = 'pending');
CREATE POLICY "Admins manage all payouts" ON public.driver_payouts
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_driver_payouts_updated_at
  BEFORE UPDATE ON public.driver_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_payouts;
