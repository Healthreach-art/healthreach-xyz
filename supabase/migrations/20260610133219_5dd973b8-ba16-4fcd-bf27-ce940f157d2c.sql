
-- A. Columns first so policies can reference them
CREATE TABLE IF NOT EXISTS public.order_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  pharmacy_id uuid,
  status text NOT NULL DEFAULT 'pending',
  delivery_code text,
  pickup_code text,
  delivery_address text,
  delivery_lat double precision,
  delivery_lng double precision,
  pickup_lat double precision,
  pickup_lng double precision,
  delivery_km numeric,
  delivery_fee numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  notes text,
  priority boolean DEFAULT false,
  scheduled_for timestamptz,
  recipient_name text,
  recipient_phone text,
  recipient_family_member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_group_id uuid REFERENCES public.order_groups(id) ON DELETE SET NULL;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS order_group_id uuid REFERENCES public.order_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_order_group_id_idx ON public.orders(order_group_id);
CREATE INDEX IF NOT EXISTS deliveries_order_group_id_idx ON public.deliveries(order_group_id);

-- B. Grants + RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_groups TO authenticated;
GRANT ALL ON public.order_groups TO service_role;

ALTER TABLE public.order_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients see own groups" ON public.order_groups;
DROP POLICY IF EXISTS "Pharmacy sees assigned groups" ON public.order_groups;
DROP POLICY IF EXISTS "Driver sees groups they deliver" ON public.order_groups;
DROP POLICY IF EXISTS "Admin sees all groups" ON public.order_groups;
DROP POLICY IF EXISTS "Patient can insert own group" ON public.order_groups;
DROP POLICY IF EXISTS "Pharmacy can update own group" ON public.order_groups;

CREATE POLICY "Patients see own groups" ON public.order_groups
  FOR SELECT TO authenticated USING (patient_id = auth.uid());
CREATE POLICY "Pharmacy sees assigned groups" ON public.order_groups
  FOR SELECT TO authenticated USING (pharmacy_id = auth.uid());
CREATE POLICY "Driver sees groups they deliver" ON public.order_groups
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.deliveries d
              WHERE d.order_group_id = order_groups.id
                AND d.driver_id = auth.uid())
  );
CREATE POLICY "Admin sees all groups" ON public.order_groups
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Patient can insert own group" ON public.order_groups
  FOR INSERT TO authenticated WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Pharmacy can update own group" ON public.order_groups
  FOR UPDATE TO authenticated USING (pharmacy_id = auth.uid())
  WITH CHECK (pharmacy_id = auth.uid());

-- C. Triggers
CREATE OR REPLACE FUNCTION public.generate_group_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.delivery_code IS NULL THEN
    NEW.delivery_code := lpad((floor(random()*1000000))::text, 6, '0');
  END IF;
  IF NEW.pickup_code IS NULL THEN
    NEW.pickup_code := lpad((floor(random()*1000000))::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_generate_group_codes ON public.order_groups;
CREATE TRIGGER trg_generate_group_codes BEFORE INSERT ON public.order_groups
FOR EACH ROW EXECUTE FUNCTION public.generate_group_codes();

DROP TRIGGER IF EXISTS trg_order_groups_updated_at ON public.order_groups;
CREATE TRIGGER trg_order_groups_updated_at BEFORE UPDATE ON public.order_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- D. "Find one pharmacy with all meds" helper
CREATE OR REPLACE FUNCTION public.find_pharmacy_with_all_meds(
  _med_ids uuid[],
  _lat double precision,
  _lng double precision,
  _max_km integer DEFAULT 60
) RETURNS TABLE(pharmacy_id uuid, distance_km double precision, has_all boolean, match_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH nearby AS (
    SELECT * FROM public.find_pharmacies_near(_lat, _lng, _max_km)
  ),
  per_pharmacy AS (
    SELECT n.pharmacy_id, n.distance_km,
           (SELECT count(DISTINCT m.id)
              FROM public.medications m
             WHERE m.pharmacy_id = n.pharmacy_id
               AND m.id = ANY(_med_ids)
               AND m.stock_quantity > 0) AS match_count
      FROM nearby n
  )
  SELECT pp.pharmacy_id,
         pp.distance_km,
         (pp.match_count = array_length(_med_ids,1)) AS has_all,
         pp.match_count::int
    FROM per_pharmacy pp
   WHERE pp.match_count > 0
   ORDER BY (pp.match_count = array_length(_med_ids,1)) DESC,
            pp.match_count DESC,
            pp.distance_km ASC;
$$;

-- E. One delivery per GROUP (not per medicine row)
CREATE OR REPLACE FUNCTION public.create_delivery_on_ready()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group uuid;
BEGIN
  IF NEW.status::text = 'ready' AND (OLD.status::text IS DISTINCT FROM 'ready') THEN
    v_group := NEW.order_group_id;
    IF v_group IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE order_group_id = v_group) THEN
        INSERT INTO public.deliveries (order_id, order_group_id, status, delivery_address)
        VALUES (NEW.id, v_group, 'assigned', COALESCE(NEW.delivery_address,''));
      END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = NEW.id) THEN
        INSERT INTO public.deliveries (order_id, status, delivery_address)
        VALUES (NEW.id, 'assigned', COALESCE(NEW.delivery_address,''));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
