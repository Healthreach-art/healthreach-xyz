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
  SELECT id, pharmacy_id, medication_name, quantity, delivery_address, status, pickup_lat, pickup_lng
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

  v_pickup_lat := COALESCE(v_order.pickup_lat, v_pharmacy.latitude);
  v_pickup_lng := COALESCE(v_order.pickup_lng, v_pharmacy.longitude);
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
      ds.driver_id,
      public.haversine_km(v_pickup_lat, v_pickup_lng, COALESCE(dl.lat, p.latitude), COALESCE(dl.lng, p.longitude)) AS distance_km,
      COALESCE(dl.updated_at, p.updated_at, ds.last_ping_at) AS location_updated_at
    FROM public.driver_status ds
    JOIN public.profiles p ON p.user_id = ds.driver_id
    JOIN public.user_roles ur ON ur.user_id = ds.driver_id AND ur.role = 'driver'::public.app_role
    LEFT JOIN public.driver_locations dl ON dl.driver_id = ds.driver_id
    WHERE ds.status = 'online'
      AND ds.last_ping_at > now() - interval '10 minutes'
      AND (dl.driver_id IS NOT NULL OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL))
      AND (dl.updated_at IS NULL OR dl.updated_at > now() - interval '30 minutes')
      AND p.approval_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_offers old
         WHERE old.order_id = v_order.id
           AND old.target_driver_id = ds.driver_id
           AND (
             old.status IN ('accepted'::public.offer_status, 'declined'::public.offer_status)
             OR ds.driver_id = ANY(old.declined_by)
           )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries active
        WHERE active.driver_id = ds.driver_id
          AND active.status::text IN ('assigned', 'picked_up', 'in_transit')
      )
  ) ranked
  WHERE ranked.distance_km <= _radius_km
  ORDER BY ranked.distance_km ASC, ranked.location_updated_at DESC
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

GRANT EXECUTE ON FUNCTION public.dispatch_ready_order_to_drivers(uuid, integer, integer) TO service_role;