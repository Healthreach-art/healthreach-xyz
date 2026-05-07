
-- Live driver locations (one row per driver, updated frequently)
CREATE TABLE IF NOT EXISTS public.driver_locations (
  driver_id uuid PRIMARY KEY,
  order_id uuid,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  speed double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers upsert own location" ON public.driver_locations
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Order participants view driver location" ON public.driver_locations
  FOR SELECT USING (
    order_id IS NOT NULL AND public.is_order_participant(auth.uid(), order_id)
  );

CREATE POLICY "Admins view all driver locations" ON public.driver_locations
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;

-- Notifications log
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'push',
  category text NOT NULL DEFAULT 'order',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System inserts notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Notify patient on order status changes (respecting preferences happens client-side)
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefs RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO prefs FROM public.notification_preferences WHERE user_id = NEW.patient_id;
    -- Patient
    IF prefs.push_orders IS NULL OR prefs.push_orders = true THEN
      INSERT INTO public.notifications (user_id, category, title, body, link)
      VALUES (NEW.patient_id, 'order', 'Order ' || replace(NEW.status::text,'_',' '),
              'Your order for ' || NEW.medication_name || ' is now ' || replace(NEW.status::text,'_',' ') || '.',
              '/dashboard/patient#orders');
    END IF;
    -- Pharmacy gets a heads-up too
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.pharmacy_id, 'order', 'Order updated',
            'Order ' || substr(NEW.id::text,1,8) || ' is ' || replace(NEW.status::text,'_',' ') || '.',
            '/dashboard/pharmacy#orders');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_order_status_change ON public.orders;
CREATE TRIGGER trg_notify_order_status_change
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_status_change();

-- Notify patient + pharmacy on delivery status changes
CREATE OR REPLACE FUNCTION public.notify_delivery_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE patient uuid; pharmacy uuid; med text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT patient_id, pharmacy_id, medication_name INTO patient, pharmacy, med
      FROM public.orders WHERE id = NEW.order_id;
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (patient, 'delivery', 'Delivery ' || replace(NEW.status::text,'_',' '),
            'Your ' || med || ' delivery is ' || replace(NEW.status::text,'_',' ') || '.',
            '/dashboard/patient#orders');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_delivery_status_change ON public.deliveries;
CREATE TRIGGER trg_notify_delivery_status_change
AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_status_change();

-- Notify on payment status (completed, failed, refunded)
CREATE OR REPLACE FUNCTION public.notify_payment_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR OLD IS NULL THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (NEW.patient_id, 'payment',
            'Payment ' || NEW.status::text,
            CASE NEW.status::text
              WHEN 'completed' THEN 'Payment of R ' || coalesce(NEW.total_paid, NEW.amount)::text || ' received.'
              WHEN 'failed' THEN 'Payment failed: ' || coalesce(NEW.failure_reason,'please retry') || '.'
              WHEN 'refunded' THEN 'Refund of R ' || coalesce(NEW.refund_amount,0)::text || ' processed.'
              ELSE 'Payment status: ' || NEW.status::text
            END,
            '/dashboard/patient#orders');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_payment_status_change ON public.payments;
CREATE TRIGGER trg_notify_payment_status_change
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_status_change();

-- Allow payments table to be UPDATED by webhook (admin/system) and patient retries
CREATE POLICY "Patients can update own pending payments" ON public.payments
  FOR UPDATE USING (auth.uid() = patient_id AND status IN ('pending','failed'));
