
-- Helper SECURITY DEFINER functions to break RLS recursion between orders <-> deliveries

CREATE OR REPLACE FUNCTION app_private.is_driver_for_order(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = _order_id AND d.driver_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION app_private.is_patient_for_order(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = _order_id AND o.patient_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION app_private.is_pharmacy_for_order(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = _order_id AND o.pharmacy_id = _user_id);
$$;

-- orders: replace recursive driver policy
DROP POLICY IF EXISTS "Drivers view assigned orders" ON public.orders;
CREATE POLICY "Drivers view assigned orders" ON public.orders
  FOR SELECT USING (app_private.is_driver_for_order(id, auth.uid()));

-- deliveries: replace recursive patient/pharmacy policies
DROP POLICY IF EXISTS "Patients view own deliveries" ON public.deliveries;
CREATE POLICY "Patients view own deliveries" ON public.deliveries
  FOR SELECT USING (app_private.is_patient_for_order(order_id, auth.uid()));

DROP POLICY IF EXISTS "Pharmacies can view their order deliveries" ON public.deliveries;
CREATE POLICY "Pharmacies can view their order deliveries" ON public.deliveries
  FOR SELECT USING (app_private.is_pharmacy_for_order(order_id, auth.uid()));
