
-- 1) Coordinates on profiles (for pharmacies & drivers home base)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS service_radius_km integer NOT NULL DEFAULT 60;

-- 2) Coordinates + assignment state on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_lat double precision,
  ADD COLUMN IF NOT EXISTS pickup_lng double precision,
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS assignment_radius_km integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pharmacy_assigned_at timestamptz;

-- Make pharmacy_id nullable so orders can be created before a pharmacy accepts
ALTER TABLE public.orders ALTER COLUMN pharmacy_id DROP NOT NULL;

-- 3) Pharmacy offers (auto-routing tier system)
CREATE TABLE IF NOT EXISTS public.pharmacy_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  distance_km numeric NOT NULL,
  tier_km integer NOT NULL,
  status text NOT NULL DEFAULT 'open', -- open | accepted | declined | expired
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 seconds'),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_offers_pharmacy_open
  ON public.pharmacy_offers(pharmacy_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_pharmacy_offers_order
  ON public.pharmacy_offers(order_id);

ALTER TABLE public.pharmacy_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pharmacies view own offers"
  ON public.pharmacy_offers FOR SELECT
  USING (auth.uid() = pharmacy_id);

CREATE POLICY "Patients view offers for own orders"
  ON public.pharmacy_offers FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Pharmacies update own open offers"
  ON public.pharmacy_offers FOR UPDATE
  USING (auth.uid() = pharmacy_id AND status = 'open');

CREATE POLICY "Admins manage all pharmacy offers"
  ON public.pharmacy_offers FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- 4) Haversine distance helper (km)
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 2 * 6371 * asin(sqrt(
    sin(radians((lat2 - lat1)/2))^2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians((lon2 - lon1)/2))^2
  ));
$$;

-- 5) Find pharmacies within a radius of a point, ordered by distance
CREATE OR REPLACE FUNCTION public.find_pharmacies_near(_lat double precision, _lng double precision, _max_km integer)
RETURNS TABLE(pharmacy_id uuid, organization_name text, distance_km double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, COALESCE(p.organization_name, p.full_name),
         public.haversine_km(_lat, _lng, p.latitude, p.longitude) AS distance_km
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'pharmacy'::app_role
   WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
     AND p.approval_status = 'approved'
     AND public.haversine_km(_lat, _lng, p.latitude, p.longitude) <= _max_km
   ORDER BY distance_km ASC;
$$;

-- 6) Pharmacy accepts an offer (atomic: binds order, closes other offers)
CREATE OR REPLACE FUNCTION public.accept_pharmacy_offer(_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_offer pharmacy_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM public.pharmacy_offers WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.pharmacy_id <> auth.uid() THEN RAISE EXCEPTION 'Not your offer'; END IF;
  IF v_offer.status <> 'open' THEN RAISE EXCEPTION 'Offer no longer open'; END IF;
  IF v_offer.expires_at < now() THEN
    UPDATE public.pharmacy_offers SET status='expired' WHERE id=_offer_id;
    RAISE EXCEPTION 'Offer expired';
  END IF;

  -- Bind order to this pharmacy if still unassigned
  UPDATE public.orders
     SET pharmacy_id = v_offer.pharmacy_id,
         pharmacy_assigned_at = now(),
         status = 'preparing',
         updated_at = now()
   WHERE id = v_offer.order_id AND pharmacy_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order already assigned to another pharmacy';
  END IF;

  UPDATE public.pharmacy_offers
     SET status = 'accepted', responded_at = now()
   WHERE id = _offer_id;

  -- Close sibling offers for the same order
  UPDATE public.pharmacy_offers
     SET status = 'expired'
   WHERE order_id = v_offer.order_id AND id <> _offer_id AND status = 'open';

  RETURN v_offer.order_id;
END $$;

-- 7) Pharmacy declines an offer
CREATE OR REPLACE FUNCTION public.decline_pharmacy_offer(_offer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.pharmacy_offers
     SET status = 'declined', responded_at = now()
   WHERE id = _offer_id AND pharmacy_id = auth.uid() AND status = 'open';
END $$;

-- 8) Notify pharmacy on new offer
CREATE OR REPLACE FUNCTION public.notify_pharmacy_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, category, title, body, link)
  VALUES (NEW.pharmacy_id, 'order', 'New delivery request',
          'Patient ' || round(NEW.distance_km::numeric, 1) || ' km away — respond within 60 s.',
          '/dashboard/pharmacy');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_pharmacy_offer ON public.pharmacy_offers;
CREATE TRIGGER trg_notify_pharmacy_offer
  AFTER INSERT ON public.pharmacy_offers
  FOR EACH ROW EXECUTE FUNCTION public.notify_pharmacy_offer();
