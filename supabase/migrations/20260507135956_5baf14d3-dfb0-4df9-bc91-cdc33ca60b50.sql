-- Enhanced payments columns
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS subtotal numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS total_paid numeric(10,2),
  ADD COLUMN IF NOT EXISTS pharmacy_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS driver_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refund_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS pharmacy_id uuid,
  ADD COLUMN IF NOT EXISTS retry_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Unique invoice number
CREATE UNIQUE INDEX IF NOT EXISTS payments_invoice_number_key ON public.payments(invoice_number) WHERE invoice_number IS NOT NULL;

-- Prevent duplicate completed payments per order
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_completed_per_order
  ON public.payments(order_id) WHERE status = 'completed';

-- Invoice number generator
CREATE SEQUENCE IF NOT EXISTS public.invoice_seq START 1000;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_invoice_trigger ON public.payments;
CREATE TRIGGER payments_invoice_trigger
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

-- Auto-update orders status to 'paid' (preparing) on completed payment
CREATE OR REPLACE FUNCTION public.handle_payment_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.orders SET status = 'preparing', updated_at = now()
      WHERE id = NEW.order_id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_status_trigger ON public.payments;
CREATE TRIGGER payments_status_trigger
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_payment_completed();

-- updated_at trigger for payments
DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: pharmacy can view payments for their orders (without seeing full breakdown)
DROP POLICY IF EXISTS "Pharmacy can view payments for their orders" ON public.payments;
CREATE POLICY "Pharmacy can view payments for their orders"
  ON public.payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND o.pharmacy_id = auth.uid()));

-- User notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  email_orders boolean NOT NULL DEFAULT true,
  email_promotions boolean NOT NULL DEFAULT false,
  sms_orders boolean NOT NULL DEFAULT true,
  push_orders boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own prefs" ON public.notification_preferences;
CREATE POLICY "Users manage own prefs" ON public.notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Saved payment methods (tokenized references only)
CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand text NOT NULL,
  last4 text NOT NULL,
  exp_month int NOT NULL,
  exp_year int NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cards" ON public.saved_payment_methods;
CREATE POLICY "Users manage own cards" ON public.saved_payment_methods
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Avatar user upload" ON storage.objects;
CREATE POLICY "Avatar user upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Avatar user update" ON storage.objects;
CREATE POLICY "Avatar user update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Avatar user delete" ON storage.objects;
CREATE POLICY "Avatar user delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);