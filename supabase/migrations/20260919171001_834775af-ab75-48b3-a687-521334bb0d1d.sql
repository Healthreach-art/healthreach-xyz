SET check_function_bodies = off;

-- ============ PROVIDERS ============
CREATE TABLE public.homecare_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  provider_type text NOT NULL DEFAULT 'company' CHECK (provider_type IN ('company','individual')),
  business_name text NOT NULL DEFAULT '',
  registration_number text,
  contact_person text,
  full_name text,
  email text NOT NULL DEFAULT '',
  phone text,
  address text,
  latitude double precision,
  longitude double precision,
  service_areas text[] NOT NULL DEFAULT '{}',
  services text[] NOT NULL DEFAULT '{}',
  operating_hours text NOT NULL DEFAULT '',
  availability text NOT NULL DEFAULT '',
  pricing_notes text,
  hourly_rate numeric(10,2),
  qualifications text,
  certifications text[] NOT NULL DEFAULT '{}',
  bank_name text,
  account_holder text,
  account_number text,
  branch_code text,
  approval_status public.approval_status NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  requested_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.homecare_providers TO authenticated;
GRANT ALL ON public.homecare_providers TO service_role;
ALTER TABLE public.homecare_providers ENABLE ROW LEVEL SECURITY;

-- security-definer membership helper (avoids recursive policies)
CREATE OR REPLACE FUNCTION public.is_homecare_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.homecare_providers p WHERE p.id = _company_id AND p.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.homecare_staff s WHERE s.company_id = _company_id AND s.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_homecare_member(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.homecare_company_id_for(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.id FROM public.homecare_providers p WHERE p.user_id = _user_id),
    (SELECT s.company_id FROM public.homecare_staff s WHERE s.user_id = _user_id LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION public.homecare_company_id_for(uuid) FROM anon;

-- ============ STAFF ============
CREATE TABLE public.homecare_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.homecare_providers(id) ON DELETE CASCADE,
  user_id uuid,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  job_title text,
  is_active boolean NOT NULL DEFAULT true,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homecare_staff TO authenticated;
GRANT ALL ON public.homecare_staff TO service_role;
ALTER TABLE public.homecare_staff ENABLE ROW LEVEL SECURITY;

-- ============ DOCUMENTS ============
CREATE TABLE public.homecare_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.homecare_providers(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.homecare_staff(id) ON DELETE CASCADE,
  doc_key text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homecare_documents TO authenticated;
GRANT ALL ON public.homecare_documents TO service_role;
ALTER TABLE public.homecare_documents ENABLE ROW LEVEL SECURITY;

-- ============ REQUESTS ============
CREATE TABLE public.homecare_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  service_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  preferred_at timestamptz,
  duration_hours numeric(5,2),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','assigned','accepted','scheduled','in_progress','completed','confirmed','cancelled','rejected')),
  admin_notes text,
  provider_id uuid REFERENCES public.homecare_providers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.homecare_requests TO authenticated;
GRANT ALL ON public.homecare_requests TO service_role;
ALTER TABLE public.homecare_requests ENABLE ROW LEVEL SECURITY;

-- ============ ASSIGNMENTS ============
CREATE TABLE public.homecare_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.homecare_requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.homecare_providers(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.homecare_staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered','accepted','declined','scheduled','in_progress','completed','confirmed','cancelled')),
  scheduled_at timestamptz,
  accepted_at timestamptz,
  declined_reason text,
  completed_at timestamptz,
  completion_notes text,
  patient_confirmed_at timestamptz,
  amount numeric(10,2),
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.homecare_assignments TO authenticated;
GRANT ALL ON public.homecare_assignments TO service_role;
ALTER TABLE public.homecare_assignments ENABLE ROW LEVEL SECURITY;

-- ============ APPROVAL HISTORY ============
CREATE TABLE public.homecare_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.homecare_providers(id) ON DELETE CASCADE,
  admin_id uuid,
  admin_email text,
  action text NOT NULL,
  reason text,
  requested_documents jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.homecare_approval_events TO authenticated;
GRANT ALL ON public.homecare_approval_events TO service_role;
ALTER TABLE public.homecare_approval_events ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES: providers ============
CREATE POLICY "hc_providers_own_select" ON public.homecare_providers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_homecare_member(id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "hc_providers_approved_visible" ON public.homecare_providers FOR SELECT TO authenticated
  USING (approval_status = 'approved' AND is_active = true);
CREATE POLICY "hc_providers_own_insert" ON public.homecare_providers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND approval_status = 'pending' AND is_active = false);
CREATE POLICY "hc_providers_own_update" ON public.homecare_providers FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "hc_providers_admin_update" ON public.homecare_providers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- providers cannot change their own approval state
CREATE OR REPLACE FUNCTION public.guard_homecare_self_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.requested_documents IS DISTINCT FROM OLD.requested_documents
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'Only an administrator can change approval status';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_homecare_self_approval BEFORE UPDATE ON public.homecare_providers
  FOR EACH ROW EXECUTE FUNCTION public.guard_homecare_self_approval();
CREATE TRIGGER homecare_providers_updated_at BEFORE UPDATE ON public.homecare_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ POLICIES: staff ============
CREATE POLICY "hc_staff_select" ON public.homecare_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_homecare_member(company_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "hc_staff_company_insert" ON public.homecare_staff FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.homecare_providers p WHERE p.id = company_id AND p.user_id = auth.uid()));
CREATE POLICY "hc_staff_company_update" ON public.homecare_staff FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homecare_providers p WHERE p.id = company_id AND p.user_id = auth.uid()) OR user_id = auth.uid())
  WITH CHECK (EXISTS (SELECT 1 FROM public.homecare_providers p WHERE p.id = company_id AND p.user_id = auth.uid()) OR user_id = auth.uid());
CREATE POLICY "hc_staff_company_delete" ON public.homecare_staff FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homecare_providers p WHERE p.id = company_id AND p.user_id = auth.uid()));
CREATE TRIGGER homecare_staff_updated_at BEFORE UPDATE ON public.homecare_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ POLICIES: documents ============
CREATE POLICY "hc_docs_select" ON public.homecare_documents FOR SELECT TO authenticated
  USING (public.is_homecare_member(provider_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "hc_docs_insert" ON public.homecare_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_homecare_member(provider_id) AND status = 'pending');
CREATE POLICY "hc_docs_owner_update" ON public.homecare_documents FOR UPDATE TO authenticated
  USING (public.is_homecare_member(provider_id)) WITH CHECK (public.is_homecare_member(provider_id));
CREATE POLICY "hc_docs_admin_update" ON public.homecare_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "hc_docs_owner_delete" ON public.homecare_documents FOR DELETE TO authenticated
  USING (public.is_homecare_member(provider_id));
CREATE TRIGGER homecare_documents_updated_at BEFORE UPDATE ON public.homecare_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ POLICIES: requests ============
CREATE POLICY "hc_requests_patient_select" ON public.homecare_requests FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
         OR (provider_id IS NOT NULL AND public.is_homecare_member(provider_id)));
CREATE POLICY "hc_requests_patient_insert" ON public.homecare_requests FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid() AND status = 'pending_review' AND provider_id IS NULL);
CREATE POLICY "hc_requests_patient_update" ON public.homecare_requests FOR UPDATE TO authenticated
  USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
CREATE POLICY "hc_requests_admin_update" ON public.homecare_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "hc_requests_provider_update" ON public.homecare_requests FOR UPDATE TO authenticated
  USING (provider_id IS NOT NULL AND public.is_homecare_member(provider_id))
  WITH CHECK (provider_id IS NOT NULL AND public.is_homecare_member(provider_id));
CREATE TRIGGER homecare_requests_updated_at BEFORE UPDATE ON public.homecare_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- customers may not self-assign a provider
CREATE OR REPLACE FUNCTION public.guard_homecare_request_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN
    RAISE EXCEPTION 'Only an administrator can assign a home care provider';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_homecare_request_assignment BEFORE UPDATE ON public.homecare_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_homecare_request_assignment();

-- ============ POLICIES: assignments ============
CREATE POLICY "hc_assign_select" ON public.homecare_assignments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
         OR public.is_homecare_member(provider_id)
         OR EXISTS (SELECT 1 FROM public.homecare_requests r WHERE r.id = request_id AND r.patient_id = auth.uid()));
CREATE POLICY "hc_assign_admin_insert" ON public.homecare_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "hc_assign_admin_update" ON public.homecare_assignments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "hc_assign_provider_update" ON public.homecare_assignments FOR UPDATE TO authenticated
  USING (public.is_homecare_member(provider_id)) WITH CHECK (public.is_homecare_member(provider_id));
CREATE POLICY "hc_assign_patient_confirm" ON public.homecare_assignments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homecare_requests r WHERE r.id = request_id AND r.patient_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.homecare_requests r WHERE r.id = request_id AND r.patient_id = auth.uid()));
CREATE TRIGGER homecare_assignments_updated_at BEFORE UPDATE ON public.homecare_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- keep the request status mirrored from the assignment
CREATE OR REPLACE FUNCTION public.sync_homecare_request_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.homecare_requests
     SET status = CASE NEW.status
       WHEN 'offered' THEN 'assigned'
       WHEN 'declined' THEN 'pending_review'
       ELSE NEW.status END,
         provider_id = CASE WHEN NEW.status = 'declined' THEN NULL ELSE NEW.provider_id END,
         updated_at = now()
   WHERE id = NEW.request_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER sync_homecare_request_status AFTER INSERT OR UPDATE OF status ON public.homecare_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_homecare_request_status();

-- ============ POLICIES: approval history ============
CREATE POLICY "hc_events_select" ON public.homecare_approval_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_homecare_member(provider_id));
CREATE POLICY "hc_events_admin_insert" ON public.homecare_approval_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ NEARBY SEARCH ============
CREATE OR REPLACE FUNCTION public.find_homecare_near(_lat double precision, _lng double precision, _max_km integer DEFAULT 100)
RETURNS TABLE (
  id uuid, provider_type text, display_name text, city text, address text,
  services text[], service_areas text[], hourly_rate numeric, operating_hours text,
  latitude double precision, longitude double precision, distance_km double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.provider_type,
         COALESCE(NULLIF(p.business_name, ''), p.full_name, '') AS display_name,
         COALESCE(split_part(p.address, ',', 1), '') AS city,
         p.address, p.services, p.service_areas, p.hourly_rate, p.operating_hours,
         p.latitude, p.longitude,
         round(public.haversine_km(_lat, _lng, p.latitude, p.longitude)::numeric, 1)::double precision AS distance_km
  FROM public.homecare_providers p
  WHERE p.approval_status = 'approved' AND p.is_active = true
    AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    AND public.haversine_km(_lat, _lng, p.latitude, p.longitude) <= _max_km
  ORDER BY distance_km;
$$;
REVOKE ALL ON FUNCTION public.find_homecare_near(double precision, double precision, integer) FROM anon;

CREATE INDEX idx_homecare_providers_status ON public.homecare_providers (approval_status, is_active);
CREATE INDEX idx_homecare_staff_company ON public.homecare_staff (company_id);
CREATE INDEX idx_homecare_docs_provider ON public.homecare_documents (provider_id);
CREATE INDEX idx_homecare_requests_patient ON public.homecare_requests (patient_id, status);
CREATE INDEX idx_homecare_assignments_provider ON public.homecare_assignments (provider_id, status);