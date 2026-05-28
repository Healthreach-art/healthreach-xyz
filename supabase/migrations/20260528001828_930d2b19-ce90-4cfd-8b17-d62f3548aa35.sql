CREATE OR REPLACE FUNCTION public.accept_delivery_offer_for_driver(_offer_id uuid, _driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_offer public.delivery_offers%ROWTYPE;
  v_order record;
  v_pharmacy record;
  v_pickup text;
BEGIN
  IF NOT app_private.has_role(_driver_id, 'driver'::public.app_role) THEN
    RAISE EXCEPTION 'Driver role required';
  END IF;

  SELECT * INTO v_offer
    FROM public.delivery_offers
   WHERE id = _offer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF v_offer.status <> 'open'::public.offer_status OR v_offer.expires_at <= now() THEN
    RAISE EXCEPTION 'Offer is no longer available';
  END IF;

  IF v_offer.target_driver_id IS NOT NULL AND v_offer.target_driver_id <> _driver_id THEN
    RAISE EXCEPTION 'This offer is for another driver';
  END IF;

  IF _driver_id = ANY(v_offer.declined_by) THEN
    RAISE EXCEPTION 'Offer already declined';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deliveries d
     WHERE d.order_id = v_offer.order_id
       AND d.driver_id IS NOT NULL
       AND d.status::text IN ('assigned', 'picked_up', 'in_transit')
  ) THEN
    UPDATE public.delivery_offers
       SET status = 'expired', updated_at = now()
     WHERE order_id = v_offer.order_id
       AND status = 'open'::public.offer_status;
    RAISE EXCEPTION 'Too late — another driver took it';
  END IF;

  SELECT id, patient_id, delivery_address, medication_name, pharmacy_id
    INTO v_order
    FROM public.orders
   WHERE id = v_offer.order_id
   FOR UPDATE;

  SELECT address, organization_name
    INTO v_pharmacy
    FROM public.profiles
   WHERE user_id = v_offer.pharmacy_id;

  v_pickup := COALESCE(NULLIF(v_pharmacy.address, ''), NULLIF(v_pharmacy.organization_name, ''), 'Pharmacy pickup point');

  UPDATE public.delivery_offers
     SET status = 'accepted', accepted_by = _driver_id, updated_at = now()
   WHERE id = _offer_id;

  UPDATE public.delivery_offers
     SET status = 'expired', updated_at = now()
   WHERE order_id = v_offer.order_id
     AND id <> _offer_id
     AND status = 'open'::public.offer_status;

  IF EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = v_offer.order_id) THEN
    UPDATE public.deliveries
       SET driver_id = _driver_id,
           status = 'assigned',
           pickup_address = COALESCE(NULLIF(pickup_address, ''), v_pickup),
           delivery_address = COALESCE(NULLIF(delivery_address, ''), COALESCE(v_order.delivery_address, '')),
           updated_at = now()
     WHERE order_id = v_offer.order_id;
  ELSE
    INSERT INTO public.deliveries (order_id, driver_id, status, pickup_address, delivery_address, estimated_time)
    VALUES (v_offer.order_id, _driver_id, 'assigned', v_pickup, COALESCE(v_order.delivery_address, ''), '30-45 minutes');
  END IF;

  UPDATE public.driver_locations
     SET order_id = v_offer.order_id, updated_at = now()
   WHERE driver_id = _driver_id;

  UPDATE public.orders
     SET status = 'ready', updated_at = now()
   WHERE id = v_offer.order_id
     AND status::text NOT IN ('delivered', 'cancelled', 'out_for_delivery');

  INSERT INTO public.notifications (user_id, category, title, body, link)
  VALUES
    (v_order.patient_id, 'delivery', 'Driver assigned', 'A driver accepted your order and is heading to the pharmacy.', '/dashboard/patient#orders'),
    (v_offer.pharmacy_id, 'delivery', 'Driver assigned', 'A driver accepted ' || COALESCE(v_order.medication_name, 'the order') || '.', '/dashboard/pharmacy#deliveries');

  RETURN jsonb_build_object('ok', true, 'order_id', v_offer.order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_delivery_offer_for_driver(_offer_id uuid, _driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_offer public.delivery_offers%ROWTYPE;
BEGIN
  IF NOT app_private.has_role(_driver_id, 'driver'::public.app_role) THEN
    RAISE EXCEPTION 'Driver role required';
  END IF;

  SELECT * INTO v_offer
    FROM public.delivery_offers
   WHERE id = _offer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF v_offer.target_driver_id IS NOT NULL AND v_offer.target_driver_id <> _driver_id THEN
    RAISE EXCEPTION 'This offer is for another driver';
  END IF;

  UPDATE public.delivery_offers
     SET declined_by = CASE
           WHEN _driver_id = ANY(declined_by) THEN declined_by
           ELSE array_append(declined_by, _driver_id)
         END,
         status = CASE WHEN target_driver_id = _driver_id THEN 'declined'::public.offer_status ELSE status END,
         updated_at = now()
   WHERE id = _offer_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_delivery_offer_for_driver(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decline_delivery_offer_for_driver(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer_for_driver(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_delivery_offer_for_driver(uuid, uuid) TO service_role;