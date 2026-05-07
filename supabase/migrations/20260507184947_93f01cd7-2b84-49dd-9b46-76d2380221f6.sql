-- Keep delivery.delivery_address in sync when order address changes (or on ready)
CREATE OR REPLACE FUNCTION public.sync_delivery_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_address IS DISTINCT FROM OLD.delivery_address THEN
    UPDATE public.deliveries
       SET delivery_address = COALESCE(NEW.delivery_address,''), updated_at = now()
     WHERE order_id = NEW.id
       AND status::text NOT IN ('delivered','failed','cancelled');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_delivery_address ON public.orders;
CREATE TRIGGER trg_sync_delivery_address
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_address();

-- Ensure invoice number generation trigger exists on payments
DROP TRIGGER IF EXISTS trg_generate_invoice_number ON public.payments;
CREATE TRIGGER trg_generate_invoice_number
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

-- Notify patient + pharmacy on delivery completion with a receipt link
CREATE OR REPLACE FUNCTION public.notify_delivery_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient uuid; v_pharmacy uuid; v_med text; v_inv text;
BEGIN
  IF NEW.status::text = 'delivered' AND (OLD.status::text IS DISTINCT FROM 'delivered') THEN
    SELECT patient_id, pharmacy_id, medication_name INTO v_patient, v_pharmacy, v_med
      FROM public.orders WHERE id = NEW.order_id;
    SELECT invoice_number INTO v_inv FROM public.payments
      WHERE order_id = NEW.order_id ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (v_patient, 'delivery', 'Delivered ✅',
            'Your ' || v_med || ' was delivered. Receipt ' || COALESCE(v_inv,'ready') || '.',
            '/dashboard/patient#orders');

    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (v_pharmacy, 'delivery', 'Order delivered',
            'Order for ' || v_med || ' delivered. Invoice ' || COALESCE(v_inv,'pending') || '.',
            '/dashboard/pharmacy#orders');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_delivery_completed ON public.deliveries;
CREATE TRIGGER trg_notify_delivery_completed
AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_completed();