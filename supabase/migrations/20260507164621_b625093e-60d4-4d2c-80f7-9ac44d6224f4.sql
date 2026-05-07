
-- 1. Add 'failed' to delivery_status enum
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'failed';

-- 2. Failed delivery tracking columns on deliveries
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS failure_notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS failure_photo_path text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- Earnings breakdown columns (driver-visible)
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS base_pay numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_pay numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_bonus numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip numeric DEFAULT 0;

-- 3. Driver presence / break-mode table
CREATE TABLE IF NOT EXISTS public.driver_status (
  driver_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'offline', -- online | offline | break
  break_reason text DEFAULT '',
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers manage own status" ON public.driver_status;
CREATE POLICY "Drivers manage own status" ON public.driver_status
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Admins view driver status" ON public.driver_status;
CREATE POLICY "Admins view driver status" ON public.driver_status
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Pharmacies view driver status" ON public.driver_status;
CREATE POLICY "Pharmacies view driver status" ON public.driver_status
  FOR SELECT USING (has_role(auth.uid(), 'pharmacy'::app_role));

CREATE TRIGGER trg_driver_status_updated
  BEFORE UPDATE ON public.driver_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Driver bank accounts
CREATE TABLE IF NOT EXISTS public.driver_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  bank_name text NOT NULL,
  account_holder text NOT NULL,
  account_number text NOT NULL,
  branch_code text DEFAULT '',
  account_type text DEFAULT 'cheque',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers manage own bank accounts" ON public.driver_bank_accounts;
CREATE POLICY "Drivers manage own bank accounts" ON public.driver_bank_accounts
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Admins view bank accounts" ON public.driver_bank_accounts;
CREATE POLICY "Admins view bank accounts" ON public.driver_bank_accounts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Single default bank account per driver
CREATE OR REPLACE FUNCTION public.ensure_single_default_bank()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.driver_bank_accounts SET is_default = false
      WHERE driver_id = NEW.driver_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_default_bank ON public.driver_bank_accounts;
CREATE TRIGGER trg_default_bank
  BEFORE INSERT OR UPDATE ON public.driver_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_bank();

-- 5. Storage bucket for delivery proof photos (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-proofs', 'delivery-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Drivers upload own proofs" ON storage.objects;
CREATE POLICY "Drivers upload own proofs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'delivery-proofs' AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Drivers view own proofs" ON storage.objects;
CREATE POLICY "Drivers view own proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'delivery-proofs' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- 6. Auto-expire stale open offers (15s timeout) — used by pg_cron later if desired
CREATE OR REPLACE FUNCTION public.expire_stale_offers()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.delivery_offers
     SET status = 'expired', updated_at = now()
   WHERE status = 'open' AND expires_at < now();
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_bank_accounts;
