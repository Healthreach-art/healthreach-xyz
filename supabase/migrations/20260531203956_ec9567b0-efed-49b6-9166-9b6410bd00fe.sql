
-- 1. Enum: add 'scheduled'
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'scheduled' BEFORE 'pending';

-- 2. Orders: new columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_km numeric,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_for ON public.orders(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- 3. Payments: transaction_fee
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS transaction_fee numeric DEFAULT 0;

-- 4. Notification preferences: per-stage toggles
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_order_placed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_preparing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_ready boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_picked_up boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_out_for_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_delivered boolean NOT NULL DEFAULT true;

-- 5. Pricing trigger: compute delivery_fee from distance, total from quantity
CREATE OR REPLACE FUNCTION public.validate_order_pricing()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  med_price numeric;
  km numeric;
  expected_delivery numeric;
  expected_subtotal numeric;
  expected_total numeric;
BEGIN
  IF NEW.medication_id IS NOT NULL THEN
    SELECT price INTO med_price FROM public.medications WHERE id = NEW.medication_id;
    IF med_price IS NULL THEN
      RAISE EXCEPTION 'Medication % not found', NEW.medication_id;
    END IF;

    -- Distance: use stored delivery_km, else compute from coords, else default 5
    km := NEW.delivery_km;
    IF km IS NULL AND NEW.pickup_lat IS NOT NULL AND NEW.pickup_lng IS NOT NULL
       AND NEW.delivery_lat IS NOT NULL AND NEW.delivery_lng IS NOT NULL THEN
      km := public.haversine_km(NEW.pickup_lat, NEW.pickup_lng, NEW.delivery_lat, NEW.delivery_lng);
    END IF;
    IF km IS NULL OR km < 0 THEN km := 5; END IF;
    NEW.delivery_km := round(km::numeric, 2);

    -- Pricing: R26 base + R10/km delivery; medicine marked up 15%
    expected_delivery := round((26 + 10 * NEW.delivery_km)::numeric, 2);
    expected_subtotal := round(med_price * 1.15 * NEW.quantity, 2);
    expected_total := round(expected_subtotal + expected_delivery, 2);

    NEW.delivery_fee := expected_delivery;
    NEW.total_amount := expected_total;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Payment split: driver = 85% delivery, pharmacy = med base, admin = rest minus transaction
CREATE OR REPLACE FUNCTION public.split_payment_amounts()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_delivery numeric;
  v_subtotal numeric;
  v_med_base numeric;
  v_quantity int;
  v_med_id uuid;
  v_med_price numeric;
  v_txn_fee numeric;
BEGIN
  SELECT o.total_amount, o.delivery_fee, o.medication_id, o.quantity
    INTO v_total, v_delivery, v_med_id, v_quantity
    FROM public.orders o WHERE o.id = NEW.order_id;

  v_total := COALESCE(NEW.amount, v_total, 0);
  v_delivery := COALESCE(v_delivery, 0);
  v_subtotal := round(v_total - v_delivery, 2);

  -- Pharmacy gets the un-marked-up medicine base
  v_med_price := 0;
  IF v_med_id IS NOT NULL THEN
    SELECT price INTO v_med_price FROM public.medications WHERE id = v_med_id;
  END IF;
  v_med_base := round(COALESCE(v_med_price, 0) * COALESCE(v_quantity, 1), 2);

  -- Transaction fee: 2.9% + R1 (typical Paystack), admin absorbs
  v_txn_fee := round(v_total * 0.029 + 1, 2);

  NEW.subtotal := v_subtotal;
  NEW.delivery_fee := v_delivery;
  NEW.transaction_fee := v_txn_fee;
  NEW.driver_amount := round(v_delivery * 0.85, 2);
  NEW.pharmacy_amount := v_med_base;
  NEW.platform_fee := round(v_total - NEW.driver_amount - NEW.pharmacy_amount - v_txn_fee, 2);
  NEW.total_paid := v_total;
  RETURN NEW;
END;
$$;

-- 7. Cancel: allow cancel after driver assigned; free driver and notify
CREATE OR REPLACE FUNCTION public.cancel_order_safely(_order_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_driver uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.patient_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_order.status::text = 'delivered' THEN
    RAISE EXCEPTION 'Order already delivered';
  END IF;
  IF v_order.status::text = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true);
  END IF;

  -- Free up driver if any
  SELECT driver_id INTO v_driver FROM public.deliveries
   WHERE order_id = _order_id AND driver_id IS NOT NULL LIMIT 1;

  UPDATE public.deliveries
     SET status = 'cancelled', updated_at = now()
   WHERE order_id = _order_id
     AND status::text NOT IN ('delivered', 'cancelled', 'failed');

  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = COALESCE(_reason, ''),
         updated_at = now()
   WHERE id = _order_id;

  UPDATE public.pharmacy_offers SET status = 'cancelled', responded_at = now()
   WHERE order_id = _order_id AND status = 'open';
  UPDATE public.delivery_offers SET status = 'cancelled', updated_at = now()
   WHERE order_id = _order_id AND status = 'open';

  UPDATE public.payments
     SET refund_status = 'refunded',
         refund_amount = COALESCE(total_paid, amount),
         updated_at = now()
   WHERE order_id = _order_id AND status::text = 'completed';

  IF v_driver IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (v_driver, 'delivery', 'Delivery cancelled',
            'The patient cancelled this order. You are now free to accept new offers.',
            '/dashboard/driver');
  END IF;
  IF v_order.pharmacy_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (v_order.pharmacy_id, 'order', 'Order cancelled',
            'Order ' || substr(_order_id::text,1,8) || ' was cancelled by the patient.',
            '/dashboard/pharmacy');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 8. Per-stage notification preferences in status-change trigger
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  prefs RECORD;
  send_push boolean := true;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO prefs FROM public.notification_preferences WHERE user_id = NEW.patient_id;

    IF prefs IS NOT NULL THEN
      send_push := COALESCE(prefs.push_orders, true) AND CASE NEW.status::text
        WHEN 'pending'          THEN COALESCE(prefs.push_order_placed, true)
        WHEN 'accepted'         THEN COALESCE(prefs.push_order_placed, true)
        WHEN 'preparing'        THEN COALESCE(prefs.push_preparing, true)
        WHEN 'ready'            THEN COALESCE(prefs.push_ready, true)
        WHEN 'out_for_delivery' THEN COALESCE(prefs.push_out_for_delivery, true)
        WHEN 'delivered'        THEN COALESCE(prefs.push_delivered, true)
        ELSE true
      END;
    END IF;

    IF send_push THEN
      INSERT INTO public.notifications (user_id, category, title, body, link)
      VALUES (NEW.patient_id, 'order', 'Order ' || replace(NEW.status::text,'_',' '),
              'Your order for ' || NEW.medication_name || ' is now ' || replace(NEW.status::text,'_',' ') || '.',
              '/dashboard/patient#orders');
    END IF;

    IF NEW.pharmacy_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, category, title, body, link)
      VALUES (NEW.pharmacy_id, 'order', 'Order updated',
              'Order ' || substr(NEW.id::text,1,8) || ' is ' || replace(NEW.status::text,'_',' ') || '.',
              '/dashboard/pharmacy#orders');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 9. Release scheduled orders when their time arrives
CREATE OR REPLACE FUNCTION public.release_scheduled_orders()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.orders
     SET status = 'pending', updated_at = now()
   WHERE status::text = 'scheduled'
     AND scheduled_for IS NOT NULL
     AND scheduled_for <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('released', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_scheduled_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_scheduled_orders() TO service_role;
