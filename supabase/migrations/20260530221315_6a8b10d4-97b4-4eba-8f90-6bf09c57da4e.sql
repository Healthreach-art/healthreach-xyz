
-- Cleanup demo first (avoids guard trigger on subsequent updates)
DELETE FROM public.delivery_offers WHERE is_demo = true;
DELETE FROM public.deliveries WHERE is_demo = true;
DELETE FROM public.orders WHERE is_demo = true;

-- delivery_code + verified_at on deliveries
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS delivery_code text,
  ADD COLUMN IF NOT EXISTS delivery_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.generate_delivery_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.delivery_code IS NULL THEN
    NEW.delivery_code := lpad((floor(random() * 10000))::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_generate_delivery_code ON public.deliveries;
CREATE TRIGGER trg_generate_delivery_code
BEFORE INSERT ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.generate_delivery_code();

DROP TRIGGER IF EXISTS trg_generate_pickup_code ON public.deliveries;
CREATE TRIGGER trg_generate_pickup_code
BEFORE INSERT ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.generate_pickup_code();

-- Notify pharmacy on new order
CREATE OR REPLACE FUNCTION public.notify_pharmacy_on_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pharmacy_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.pharmacy_id, 'order', 'New incoming order',
            'New order for ' || COALESCE(NEW.medication_name,'medication') || ' × ' || NEW.quantity::text || '.',
            '/dashboard/pharmacy#orders-section');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_pharmacy_on_new_order ON public.orders;
CREATE TRIGGER trg_notify_pharmacy_on_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_pharmacy_on_new_order();

-- Earnings split on payments
CREATE OR REPLACE FUNCTION public.split_payment_amounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_subtotal numeric;
  v_delivery numeric;
  v_amount numeric;
BEGIN
  v_amount   := COALESCE(NEW.amount, 0);
  v_subtotal := COALESCE(NEW.subtotal, 0);
  v_delivery := COALESCE(NEW.delivery_fee, 0);
  IF v_subtotal = 0 AND v_delivery = 0 AND v_amount > 0 THEN
    v_subtotal := round(v_amount * 0.85, 2);
    v_delivery := round(v_amount - v_subtotal, 2);
    NEW.subtotal     := v_subtotal;
    NEW.delivery_fee := v_delivery;
  END IF;
  NEW.driver_amount   := round(v_delivery * 0.90 + 10, 2);
  NEW.platform_fee    := round(v_amount * 0.10, 2);
  NEW.pharmacy_amount := round(v_amount - NEW.driver_amount - NEW.platform_fee, 2);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_split_payment_amounts ON public.payments;
CREATE TRIGGER trg_split_payment_amounts
BEFORE INSERT OR UPDATE OF amount, subtotal, delivery_fee, status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.split_payment_amounts();
