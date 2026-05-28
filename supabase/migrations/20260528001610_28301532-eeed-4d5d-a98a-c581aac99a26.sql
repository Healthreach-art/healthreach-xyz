ALTER TABLE public.delivery_offers
  ADD COLUMN IF NOT EXISTS target_driver_id uuid,
  ADD COLUMN IF NOT EXISTS offer_round integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS distance_km double precision;

CREATE INDEX IF NOT EXISTS idx_delivery_offers_target_driver
  ON public.delivery_offers(target_driver_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_delivery_offers_order_status
  ON public.delivery_offers(order_id, status, expires_at);

DROP POLICY IF EXISTS "Drivers can view open offers" ON public.delivery_offers;
CREATE POLICY "Drivers can view open offers"
ON public.delivery_offers
FOR SELECT
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'driver'::public.app_role)
  AND status = 'open'::public.offer_status
  AND expires_at > now()
  AND NOT (auth.uid() = ANY (declined_by))
  AND (target_driver_id IS NULL OR target_driver_id = auth.uid())
  AND (accepted_by IS NULL OR accepted_by = auth.uid())
);

DROP POLICY IF EXISTS "Drivers accept/decline open offers" ON public.delivery_offers;
CREATE POLICY "Drivers accept/decline open offers"
ON public.delivery_offers
FOR UPDATE
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'driver'::public.app_role)
  AND status = 'open'::public.offer_status
  AND expires_at > now()
  AND NOT (auth.uid() = ANY (declined_by))
  AND (target_driver_id IS NULL OR target_driver_id = auth.uid())
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'driver'::public.app_role)
  AND (
    (status = 'accepted'::public.offer_status AND accepted_by = auth.uid())
    OR (status = 'open'::public.offer_status AND auth.uid() = ANY (declined_by))
  )
);

CREATE OR REPLACE FUNCTION public.dispatch_ready_order_to_drivers(
  _order_id uuid,
  _max_drivers integer DEFAULT 30,
  _radius_km integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_order record;
  v_pharmacy record;
  v_pickup_lat double precision;
  v_pickup_lng double precision;
  v_pickup_address text;
  v_round integer;
  v_inserted integer := 0;
BEGIN
  SELECT id, pharmacy_id, medication_name, quantity, delivery_address, status
    INTO v_order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.pharmacy_id IS NULL THEN
    RAISE EXCEPTION 'Order has no pharmacy assigned';
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> v_order.pharmacy_id
     AND NOT app_private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized to dispatch this order';
  END IF;

  IF v_order.status::text IN ('delivered', 'cancelled', 'out_for_delivery') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_dispatchable');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deliveries
     WHERE order_id = _order_id
       AND driver_id IS NOT NULL
       AND status::text NOT IN ('failed', 'cancelled')
  ) THEN
    RETURN jsonb_build_object('ok', true, 'assigned', true, 'inserted', 0);
  END IF;

  SELECT latitude, longitude, address, organization_name
    INTO v_pharmacy
    FROM public.profiles
   WHERE user_id = v_order.pharmacy_id;

  v_pickup_lat := v_pharmacy.latitude;
  v_pickup_lng := v_pharmacy.longitude;
  v_pickup_address := COALESCE(NULLIF(v_pharmacy.address, ''), NULLIF(v_pharmacy.organization_name, ''), 'Pharmacy pickup point');

  IF v_pickup_lat IS NULL OR v_pickup_lng IS NULL THEN
    RAISE EXCEPTION 'Pharmacy pickup location is missing';
  END IF;

  UPDATE public.delivery_offers
     SET status = 'expired', updated_at = now()
   WHERE order_id = _order_id
     AND status = 'open'::public.offer_status
     AND expires_at < now();

  IF EXISTS (
    SELECT 1 FROM public.delivery_offers
     WHERE order_id = _order_id
       AND status = 'open'::public.offer_status
       AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object('ok', true, 'waiting', true, 'inserted', 0);
  END IF;

  SELECT COALESCE(MAX(offer_round), 0) + 1
    INTO v_round
    FROM public.delivery_offers
   WHERE order_id = _order_id;

  INSERT INTO public.delivery_offers (
    order_id,
    pharmacy_id,
    target_driver_id,
    offer_round,
    distance_km,
    message,
    expires_at
  )
  SELECT
    v_order.id,
    v_order.pharmacy_id,
    ranked.driver_id,
    v_round,
    ranked.distance_km,
    v_order.medication_name || ' × ' || v_order.quantity::text || ' · ' || round(ranked.distance_km::numeric, 1)::text || ' km pickup',
    now() + interval '60 seconds'
  FROM (
    SELECT
      dl.driver_id,
      public.haversine_km(v_pickup_lat, v_pickup_lng, dl.lat, dl.lng) AS distance_km,
      dl.updated_at
    FROM public.driver_locations dl
    JOIN public.driver_status ds ON ds.driver_id = dl.driver_id
    JOIN public.profiles p ON p.user_id = dl.driver_id
    JOIN public.user_roles ur ON ur.user_id = dl.driver_id AND ur.role = 'driver'::public.app_role
    WHERE ds.status = 'online'
      AND ds.last_ping_at > now() - interval '2 minutes'
      AND dl.updated_at > now() - interval '5 minutes'
      AND p.approval_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_offers old
         WHERE old.order_id = v_order.id
           AND old.target_driver_id = dl.driver_id
           AND (
             old.status IN ('accepted'::public.offer_status, 'declined'::public.offer_status)
             OR dl.driver_id = ANY(old.declined_by)
           )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries active
        WHERE active.driver_id = dl.driver_id
          AND active.status::text IN ('assigned', 'picked_up', 'in_transit')
      )
  ) ranked
  WHERE ranked.distance_km <= _radius_km
  ORDER BY ranked.distance_km ASC, ranked.updated_at DESC
  LIMIT GREATEST(1, _max_drivers);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = _order_id) THEN
    INSERT INTO public.deliveries (order_id, status, pickup_address, delivery_address, estimated_time)
    VALUES (_order_id, 'assigned', v_pickup_address, COALESCE(v_order.delivery_address, ''), '30-45 minutes');
  ELSE
    UPDATE public.deliveries
       SET pickup_address = COALESCE(NULLIF(pickup_address, ''), v_pickup_address),
           delivery_address = COALESCE(NULLIF(delivery_address, ''), COALESCE(v_order.delivery_address, '')),
           updated_at = now()
     WHERE order_id = _order_id;
  END IF;

  UPDATE public.orders
     SET status = CASE WHEN status::text = 'pending' THEN 'ready'::public.order_status ELSE status END,
         updated_at = now()
   WHERE id = _order_id;

  IF v_inserted > 0 THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    SELECT target_driver_id,
           'delivery',
           'New delivery nearby',
           'Pickup is ' || round(distance_km::numeric, 1)::text || ' km away in Cape Town. Accept within 60 seconds.',
           '/dashboard/driver#offers'
      FROM public.delivery_offers
     WHERE order_id = _order_id
       AND offer_round = v_round
       AND target_driver_id IS NOT NULL;
  END IF;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'round', v_round);
END;
$$;

CREATE OR REPLACE FUNCTION public.rebroadcast_unaccepted_delivery_orders(
  _max_orders integer DEFAULT 25,
  _max_drivers integer DEFAULT 30,
  _radius_km integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_order record;
  v_total_inserted integer := 0;
  v_processed integer := 0;
  v_result jsonb;
BEGIN
  FOR v_order IN
    SELECT o.id
      FROM public.orders o
      JOIN public.profiles p ON p.user_id = o.pharmacy_id
     WHERE o.pharmacy_id IS NOT NULL
       AND o.status::text IN ('accepted', 'preparing', 'ready')
       AND p.latitude IS NOT NULL
       AND p.longitude IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.deliveries d
          WHERE d.order_id = o.id
            AND d.driver_id IS NOT NULL
            AND d.status::text IN ('assigned', 'picked_up', 'in_transit')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.delivery_offers off
          WHERE off.order_id = o.id
            AND off.status = 'open'::public.offer_status
            AND off.expires_at > now()
       )
     ORDER BY o.updated_at ASC
     LIMIT GREATEST(1, _max_orders)
  LOOP
    v_result := public.dispatch_ready_order_to_drivers(v_order.id, _max_drivers, _radius_km);
    v_processed := v_processed + 1;
    v_total_inserted := v_total_inserted + COALESCE((v_result->>'inserted')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed, 'inserted', v_total_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_delivery_offer_safely(_offer_id uuid)
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
  SELECT * INTO v_offer
    FROM public.delivery_offers
   WHERE id = _offer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF NOT app_private.has_role(auth.uid(), 'driver'::public.app_role) THEN
    RAISE EXCEPTION 'Driver role required';
  END IF;

  IF v_offer.status <> 'open'::public.offer_status OR v_offer.expires_at <= now() THEN
    RAISE EXCEPTION 'Offer is no longer available';
  END IF;

  IF v_offer.target_driver_id IS NOT NULL AND v_offer.target_driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'This offer is for another driver';
  END IF;

  IF auth.uid() = ANY(v_offer.declined_by) THEN
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

  SELECT id, delivery_address, medication_name, pharmacy_id
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
     SET status = 'accepted', accepted_by = auth.uid(), updated_at = now()
   WHERE id = _offer_id;

  UPDATE public.delivery_offers
     SET status = 'expired', updated_at = now()
   WHERE order_id = v_offer.order_id
     AND id <> _offer_id
     AND status = 'open'::public.offer_status;

  IF EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = v_offer.order_id) THEN
    UPDATE public.deliveries
       SET driver_id = auth.uid(),
           status = 'assigned',
           pickup_address = COALESCE(NULLIF(pickup_address, ''), v_pickup),
           delivery_address = COALESCE(NULLIF(delivery_address, ''), COALESCE(v_order.delivery_address, '')),
           updated_at = now()
     WHERE order_id = v_offer.order_id;
  ELSE
    INSERT INTO public.deliveries (order_id, driver_id, status, pickup_address, delivery_address, estimated_time)
    VALUES (v_offer.order_id, auth.uid(), 'assigned', v_pickup, COALESCE(v_order.delivery_address, ''), '30-45 minutes');
  END IF;

  UPDATE public.driver_locations
     SET order_id = v_offer.order_id, updated_at = now()
   WHERE driver_id = auth.uid();

  UPDATE public.orders
     SET status = 'ready', updated_at = now()
   WHERE id = v_offer.order_id
     AND status::text NOT IN ('delivered', 'cancelled', 'out_for_delivery');

  INSERT INTO public.notifications (user_id, category, title, body, link)
  VALUES
    ((SELECT patient_id FROM public.orders WHERE id = v_offer.order_id), 'delivery', 'Driver assigned', 'A driver accepted your order and is heading to the pharmacy.', '/dashboard/patient#orders'),
    (v_offer.pharmacy_id, 'delivery', 'Driver assigned', 'A driver accepted ' || COALESCE(v_order.medication_name, 'the order') || '.', '/dashboard/pharmacy#deliveries');

  RETURN jsonb_build_object('ok', true, 'order_id', v_offer.order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_delivery_offer_safely(_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_offer public.delivery_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_offer
    FROM public.delivery_offers
   WHERE id = _offer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF NOT app_private.has_role(auth.uid(), 'driver'::public.app_role) THEN
    RAISE EXCEPTION 'Driver role required';
  END IF;

  IF v_offer.target_driver_id IS NOT NULL AND v_offer.target_driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'This offer is for another driver';
  END IF;

  UPDATE public.delivery_offers
     SET declined_by = CASE
           WHEN auth.uid() = ANY(declined_by) THEN declined_by
           ELSE array_append(declined_by, auth.uid())
         END,
         status = CASE WHEN target_driver_id = auth.uid() THEN 'declined'::public.offer_status ELSE status END,
         updated_at = now()
   WHERE id = _offer_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_ready_order_to_drivers(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rebroadcast_unaccepted_delivery_orders(integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer_safely(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_delivery_offer_safely(uuid) TO authenticated, service_role;