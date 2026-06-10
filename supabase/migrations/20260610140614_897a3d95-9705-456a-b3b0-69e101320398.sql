
-- 1. Events table
CREATE TABLE IF NOT EXISTS public.order_group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_group_id uuid NOT NULL REFERENCES public.order_groups(id) ON DELETE CASCADE,
  stage text NOT NULL,
  source text NOT NULL DEFAULT 'system', -- 'order_group' | 'delivery' | 'system'
  actor_id uuid,
  actor_role text,
  actor_name text,
  note text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_group_events_group_idx
  ON public.order_group_events(order_group_id, at);

GRANT SELECT ON public.order_group_events TO authenticated;
GRANT ALL ON public.order_group_events TO service_role;

ALTER TABLE public.order_group_events ENABLE ROW LEVEL SECURITY;

-- Patient, pharmacy, and assigned driver of the group can read its timeline. Admin can read all.
CREATE POLICY "Group participants can read events"
  ON public.order_group_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.order_groups g
       WHERE g.id = order_group_events.order_group_id
         AND (g.patient_id = auth.uid() OR g.pharmacy_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.deliveries d
       WHERE d.order_group_id = order_group_events.order_group_id
         AND d.driver_id = auth.uid()
    )
  );

-- 2. Actor resolution helper
CREATE OR REPLACE FUNCTION public.resolve_actor_name(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(p.organization_name,''), NULLIF(p.full_name,''), 'System')
    FROM public.profiles p WHERE p.user_id = _user_id;
$$;

-- 3. Trigger: log order_group status changes
CREATE OR REPLACE FUNCTION public.log_order_group_status_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text;
  v_role text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_name := COALESCE(public.resolve_actor_name(NEW.patient_id), 'Patient');
    INSERT INTO public.order_group_events (order_group_id, stage, source, actor_id, actor_role, actor_name, note)
    VALUES (NEW.id, 'placed', 'order_group', NEW.patient_id, 'patient', v_name, 'Order placed');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_name := public.resolve_actor_name(v_actor);
    v_role := public.get_user_role(v_actor)::text;
    INSERT INTO public.order_group_events (order_group_id, stage, source, actor_id, actor_role, actor_name)
    VALUES (NEW.id, NEW.status, 'order_group', v_actor, v_role, COALESCE(v_name, 'System'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_order_group_status ON public.order_groups;
CREATE TRIGGER trg_log_order_group_status
AFTER INSERT OR UPDATE OF status ON public.order_groups
FOR EACH ROW EXECUTE FUNCTION public.log_order_group_status_event();

-- 4. Trigger: log delivery status changes against group
CREATE OR REPLACE FUNCTION public.log_delivery_status_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_group uuid := NEW.order_group_id;
  v_stage text;
  v_actor uuid := COALESCE(auth.uid(), NEW.driver_id);
  v_name text;
BEGIN
  IF v_group IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_stage := CASE NEW.status::text
    WHEN 'assigned'   THEN 'assigned'
    WHEN 'picked_up'  THEN 'picked_up'
    WHEN 'in_transit' THEN 'in_transit'
    WHEN 'delivered'  THEN 'delivered'
    WHEN 'failed'     THEN 'failed'
    WHEN 'cancelled'  THEN 'cancelled'
    ELSE NEW.status::text
  END;

  v_name := public.resolve_actor_name(v_actor);
  INSERT INTO public.order_group_events (order_group_id, stage, source, actor_id, actor_role, actor_name)
  VALUES (v_group, v_stage, 'delivery', v_actor, 'driver', COALESCE(v_name, 'Driver'));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_delivery_status ON public.deliveries;
CREATE TRIGGER trg_log_delivery_status
AFTER UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.log_delivery_status_event();

-- 5. Read helper — returns events ordered, with stable shape
CREATE OR REPLACE FUNCTION public.get_order_group_timeline(_group_id uuid)
RETURNS TABLE(
  id uuid,
  stage text,
  source text,
  actor_id uuid,
  actor_role text,
  actor_name text,
  note text,
  at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id, e.stage, e.source, e.actor_id, e.actor_role, e.actor_name, e.note, e.at
    FROM public.order_group_events e
   WHERE e.order_group_id = _group_id
     AND (
       public.has_role(auth.uid(), 'admin'::app_role)
       OR EXISTS (SELECT 1 FROM public.order_groups g
                   WHERE g.id = _group_id
                     AND (g.patient_id = auth.uid() OR g.pharmacy_id = auth.uid()))
       OR EXISTS (SELECT 1 FROM public.deliveries d
                   WHERE d.order_group_id = _group_id AND d.driver_id = auth.uid())
     )
   ORDER BY e.at ASC;
$$;

-- 6. Backfill an initial 'placed' event for existing groups
INSERT INTO public.order_group_events (order_group_id, stage, source, actor_id, actor_role, actor_name, at)
SELECT g.id, 'placed', 'order_group', g.patient_id, 'patient',
       COALESCE(public.resolve_actor_name(g.patient_id), 'Patient'), g.created_at
  FROM public.order_groups g
 WHERE NOT EXISTS (SELECT 1 FROM public.order_group_events e WHERE e.order_group_id = g.id);

-- 7. Realtime
ALTER TABLE public.order_group_events REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_group_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
