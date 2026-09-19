ALTER TABLE public.doctor_documents
  ADD COLUMN IF NOT EXISTS requested_documents text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.guard_homecare_assignment_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean := public.has_role(auth.uid(), 'admin');
  _is_provider boolean := public.is_homecare_member(OLD.provider_id);
  _is_patient boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.homecare_requests r
    WHERE r.id = OLD.request_id AND r.patient_id = auth.uid()
  ) INTO _is_patient;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF _is_admin THEN
    RETURN NEW;
  END IF;

  IF _is_provider THEN
    IF (OLD.status = 'offered' AND NEW.status IN ('accepted', 'declined'))
       OR (OLD.status = 'accepted' AND NEW.status = 'scheduled')
       OR (OLD.status = 'scheduled' AND NEW.status = 'in_progress')
       OR (OLD.status = 'in_progress' AND NEW.status = 'completed') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Invalid provider assignment status transition';
  END IF;

  IF _is_patient AND OLD.status = 'completed' AND NEW.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not allowed to make this assignment status change';
END;
$$;

DROP TRIGGER IF EXISTS guard_homecare_assignment_transition ON public.homecare_assignments;
CREATE TRIGGER guard_homecare_assignment_transition
BEFORE UPDATE OF status ON public.homecare_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_homecare_assignment_transition();

CREATE OR REPLACE FUNCTION public.guard_homecare_request_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF OLD.patient_id = auth.uid() AND NEW.status = 'cancelled'
     AND OLD.status IN ('pending_review', 'assigned', 'accepted', 'scheduled') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Request status is controlled by the assignment workflow';
END;
$$;

DROP TRIGGER IF EXISTS guard_homecare_request_status_update ON public.homecare_requests;
CREATE TRIGGER guard_homecare_request_status_update
BEFORE UPDATE OF status ON public.homecare_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_homecare_request_status_update();

CREATE OR REPLACE FUNCTION public.notify_homecare_assignment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _patient_id uuid;
  _provider_user_id uuid;
  _provider_name text;
  _title text;
  _body text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT r.patient_id, p.user_id,
         COALESCE(NULLIF(p.business_name, ''), NULLIF(p.full_name, ''), 'Your home care provider')
    INTO _patient_id, _provider_user_id, _provider_name
  FROM public.homecare_requests r
  JOIN public.homecare_providers p ON p.id = NEW.provider_id
  WHERE r.id = NEW.request_id;

  IF NEW.status = 'accepted' THEN
    _title := 'Home care assignment accepted';
    _body := _provider_name || ' accepted your home care request.';
  ELSIF NEW.status = 'scheduled' THEN
    _title := 'Home care visit scheduled';
    _body := _provider_name || ' confirmed your scheduled home care visit.';
  ELSIF NEW.status = 'in_progress' THEN
    _title := 'Home care visit started';
    _body := 'Your home care visit is now in progress.';
  ELSIF NEW.status = 'completed' THEN
    _title := 'Home care visit completed';
    _body := 'Your provider marked the visit complete. Please confirm the visit in your dashboard.';
  ELSIF NEW.status = 'declined' THEN
    _title := 'Home care assignment declined';
    _body := 'The provider could not accept this visit. An administrator will review and reassign your request.';
  ELSIF NEW.status = 'confirmed' THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (_provider_user_id, 'system', 'Visit confirmed by customer', 'The customer confirmed that the home care visit was completed.', '/dashboard/homecare_company');
    RETURN NEW;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, category, title, body, link)
  VALUES (_patient_id, 'system', _title, _body, '/dashboard/patient/homecare');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_homecare_assignment_status ON public.homecare_assignments;
CREATE TRIGGER notify_homecare_assignment_status
AFTER INSERT OR UPDATE OF status ON public.homecare_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_homecare_assignment_status();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'homecare_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.homecare_requests;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'homecare_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.homecare_assignments;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'homecare_providers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.homecare_providers;
  END IF;
END $$;

ALTER TABLE public.homecare_requests REPLICA IDENTITY FULL;
ALTER TABLE public.homecare_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.homecare_providers REPLICA IDENTITY FULL;

REVOKE ALL ON FUNCTION public.guard_homecare_assignment_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_homecare_request_status_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_homecare_assignment_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_homecare_assignment_transition() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_homecare_request_status_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_homecare_assignment_status() TO service_role;