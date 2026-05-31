-- Phase 1: Block unverified drivers from receiving offers
-- Tighten dispatch_ready_order_to_drivers to require submitted ID + license + selfie

CREATE OR REPLACE FUNCTION public.dispatch_ready_order_to_drivers(_order_id uuid, _max_drivers integer DEFAULT 30, _radius_km integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  v_order record;
  v_pharmacy record;
  v_pickup_lat double precision;
  v_pickup_lng double precision;
  v_round integer;
  v_inserted integer := 0;
BEGIN
  SELECT id, pharmacy_id, medication_name, quantity, delivery_address, status, pickup_lat, pickup_lng
    INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.pharmacy_id IS NULL THEN RAISE EXCEPTION 'Order has no pharmacy assigned'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_order.pharmacy_id AND NOT app_private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized to dispatch this order';
  END IF;
  IF v_order.status::text IN ('delivered','cancelled','out_for_delivery') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_dispatchable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = _order_id AND driver_id IS NOT NULL AND status::text NOT IN ('failed','cancelled')) THEN
    RETURN jsonb_build_object('ok', true, 'assigned', true, 'inserted', 0);
  END IF;

  SELECT latitude, longitude, address, organization_name INTO v_pharmacy FROM public.profiles WHERE user_id = v_order.pharmacy_id;
  v_pickup_lat := COALESCE(v_order.pickup_lat, v_pharmacy.latitude, -33.9249);
  v_pickup_lng := COALESCE(v_order.pickup_lng, v_pharmacy.longitude, 18.4241);

  UPDATE public.delivery_offers SET status='expired', updated_at=now()
   WHERE order_id=_order_id AND status='open'::public.offer_status AND expires_at < now();

  IF EXISTS (SELECT 1 FROM public.delivery_offers WHERE order_id=_order_id AND status='open'::public.offer_status AND expires_at > now()) THEN
    RETURN jsonb_build_object('ok', true, 'waiting', true, 'inserted', 0);
  END IF;

  SELECT COALESCE(MAX(offer_round),0)+1 INTO v_round FROM public.delivery_offers WHERE order_id=_order_id;

  INSERT INTO public.delivery_offers (order_id, pharmacy_id, target_driver_id, offer_round, distance_km, message, expires_at)
  SELECT v_order.id, v_order.pharmacy_id, ranked.driver_id, v_round, ranked.distance_km,
         v_order.medication_name || ' × ' || v_order.quantity::text || ' · ' || round(ranked.distance_km::numeric,1)::text || ' km pickup',
         now() + interval '10 minutes'
  FROM (
    SELECT ds.driver_id,
           public.haversine_km(v_pickup_lat, v_pickup_lng, COALESCE(dl.lat, p.latitude, -33.9020), COALESCE(dl.lng, p.longitude, 18.4200)) AS distance_km,
           COALESCE(dl.updated_at, p.updated_at, ds.last_ping_at) AS location_updated_at
    FROM public.driver_status ds
    JOIN public.profiles p ON p.user_id = ds.driver_id
    JOIN public.user_roles ur ON ur.user_id = ds.driver_id AND ur.role='driver'::public.app_role
    LEFT JOIN public.driver_locations dl ON dl.driver_id = ds.driver_id
    WHERE ds.status='online'
      AND ds.last_ping_at > now() - interval '30 minutes'
      AND p.approval_status='approved'
      -- NEW: must have submitted core verification documents
      AND EXISTS (
        SELECT 1 FROM public.driver_documents dd
         WHERE dd.driver_id = ds.driver_id
           AND dd.selfie_path IS NOT NULL
           AND dd.id_document_path IS NOT NULL
           AND dd.license_path IS NOT NULL
           AND dd.submitted_at IS NOT NULL
      )
      AND NOT EXISTS (SELECT 1 FROM public.delivery_offers old
         WHERE old.order_id=v_order.id AND old.target_driver_id=ds.driver_id
           AND (old.status IN ('accepted'::public.offer_status,'declined'::public.offer_status) OR ds.driver_id = ANY(old.declined_by)))
      AND NOT EXISTS (SELECT 1 FROM public.deliveries active
        WHERE active.driver_id=ds.driver_id AND active.status::text IN ('assigned','picked_up','in_transit'))
  ) ranked
  WHERE ranked.distance_km <= _radius_km
  ORDER BY ranked.distance_km ASC, ranked.location_updated_at DESC
  LIMIT GREATEST(1, _max_drivers);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    INSERT INTO public.delivery_offers (order_id, pharmacy_id, target_driver_id, offer_round, distance_km, message, expires_at)
    VALUES (v_order.id, v_order.pharmacy_id, NULL, v_round, NULL,
            v_order.medication_name || ' × ' || v_order.quantity::text || ' · open driver broadcast',
            now() + interval '10 minutes');
    v_inserted := 1;
  END IF;

  UPDATE public.orders SET status='ready'::public.order_status, updated_at=now()
   WHERE id=_order_id AND status::text NOT IN ('delivered','cancelled','out_for_delivery');

  INSERT INTO public.notifications (user_id, category, title, body, link)
  SELECT target_driver_id, 'delivery', 'New delivery nearby',
         'A pharmacy broadcasted a delivery request. Open the driver dashboard to accept.',
         '/dashboard/driver#offers'
    FROM public.delivery_offers
   WHERE order_id=_order_id AND offer_round=v_round AND target_driver_id IS NOT NULL;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'round', v_round);
END;
$function$;