
-- 1. Prevent drivers from modifying financial fields on deliveries
CREATE OR REPLACE FUNCTION public.guard_driver_delivery_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the updater is the assigned driver (not admin / service role)
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.driver_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.base_pay      IS DISTINCT FROM OLD.base_pay
       OR NEW.tip          IS DISTINCT FROM OLD.tip
       OR NEW.peak_bonus   IS DISTINCT FROM OLD.peak_bonus
       OR NEW.distance_pay IS DISTINCT FROM OLD.distance_pay
       OR NEW.order_id     IS DISTINCT FROM OLD.order_id
       OR NEW.driver_id    IS DISTINCT FROM OLD.driver_id THEN
      RAISE EXCEPTION 'Drivers cannot modify payout or assignment fields on deliveries';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_driver_delivery_update ON public.deliveries;
CREATE TRIGGER trg_guard_driver_delivery_update
BEFORE UPDATE ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.guard_driver_delivery_update();

-- 2. Fix mutable search_path on haversine_km
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 2 * 6371 * asin(sqrt(
    sin(radians((lat2 - lat1)/2))^2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians((lon2 - lon1)/2))^2
  ));
$$;

-- 3. Revoke public/anon/authenticated EXECUTE on trigger-only SECURITY DEFINER functions.
DO $$
DECLARE
  fn text;
  trigger_fns text[] := ARRAY[
    'guard_prescription_upload_status()',
    'validate_payment_amount()',
    'guard_payment_status_transition()',
    'notify_order_status_change()',
    'validate_order_pricing()',
    'update_updated_at_column()',
    'set_prescription_expiry()',
    'handle_new_user()',
    'generate_invoice_number()',
    'notify_delivery_status_change()',
    'handle_payment_completed()',
    'ensure_single_default_address()',
    'notify_prescription_status_change()',
    'notify_payment_status_change()',
    'set_prescription_repeats_on_approve()',
    'sync_order_from_delivery()',
    'ensure_single_default_bank()',
    'generate_pickup_code()',
    'score_prescription_on_insert()',
    'create_delivery_on_ready()',
    'notify_delivery_completed()',
    'sync_delivery_address()',
    'notify_pharmacy_offer()',
    'guard_driver_delivery_update()',
    'expire_stale_offers()'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      -- skip
      NULL;
    END;
  END LOOP;
END $$;
