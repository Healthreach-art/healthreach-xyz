
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Unique rating per order/target_type/patient
CREATE UNIQUE INDEX IF NOT EXISTS ratings_unique_per_order_target_patient
  ON public.ratings (order_id, target_type, patient_id);

-- Realtime
ALTER TABLE public.order_messages REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_offers REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Safe cancel function: only before driver is assigned
CREATE OR REPLACE FUNCTION public.cancel_order_safely(_order_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_has_driver boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.patient_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_order.status::text IN ('delivered','cancelled','out_for_delivery') THEN
    RAISE EXCEPTION 'Order cannot be cancelled at this stage';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = _order_id AND d.driver_id IS NOT NULL
  ) INTO v_has_driver;
  IF v_has_driver THEN
    RAISE EXCEPTION 'A driver has already been assigned — please contact support to cancel';
  END IF;

  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = COALESCE(_reason, ''),
         updated_at = now()
   WHERE id = _order_id;

  -- Close any open pharmacy / delivery offers for this order
  UPDATE public.pharmacy_offers SET status = 'cancelled', responded_at = now()
   WHERE order_id = _order_id AND status = 'open';
  UPDATE public.delivery_offers SET status = 'cancelled'
   WHERE order_id = _order_id AND status = 'open';

  -- Mark payment refunded (mock provider)
  UPDATE public.payments
     SET refund_status = 'refunded',
         refund_amount = COALESCE(total_paid, amount),
         updated_at = now()
   WHERE order_id = _order_id AND status::text = 'completed';

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_order_safely(uuid, text) TO authenticated;
