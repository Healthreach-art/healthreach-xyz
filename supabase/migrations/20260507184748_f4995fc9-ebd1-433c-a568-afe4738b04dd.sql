-- Enable realtime sync across patient/pharmacy/driver dashboards
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.prescriptions REPLICA IDENTITY FULL;
ALTER TABLE public.prescription_uploads REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_offers REPLICA IDENTITY FULL;
ALTER TABLE public.medications REPLICA IDENTITY FULL;
ALTER TABLE public.ratings REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['orders','deliveries','payments','prescriptions','prescription_uploads','delivery_offers','medications','ratings'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Auto-create a delivery row when an order becomes 'ready' so drivers see it instantly
CREATE OR REPLACE FUNCTION public.create_delivery_on_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'ready' AND (OLD.status::text IS DISTINCT FROM 'ready') THEN
    IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = NEW.id) THEN
      INSERT INTO public.deliveries (order_id, status, delivery_address)
      VALUES (NEW.id, 'assigned', COALESCE(NEW.delivery_address,''));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_delivery_on_ready ON public.orders;
CREATE TRIGGER trg_create_delivery_on_ready
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.create_delivery_on_ready();

-- Sync order status when delivery progresses (picked_up / delivered)
CREATE OR REPLACE FUNCTION public.sync_order_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'picked_up' THEN
      UPDATE public.orders SET status = 'out_for_delivery', updated_at = now()
        WHERE id = NEW.order_id AND status::text NOT IN ('delivered','cancelled');
    ELSIF NEW.status::text = 'delivered' THEN
      UPDATE public.orders SET status = 'delivered', updated_at = now()
        WHERE id = NEW.order_id AND status::text <> 'delivered';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_order_from_delivery ON public.deliveries;
CREATE TRIGGER trg_sync_order_from_delivery
AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.sync_order_from_delivery();