CREATE OR REPLACE FUNCTION public.guard_driver_delivery_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.driver_id
     AND NOT app_private.has_role(auth.uid(), 'admin'::app_role) THEN
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