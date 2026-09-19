-- Replace the security-definer view with column-level protection on the table itself.
DROP VIEW IF EXISTS public.homecare_providers_public;

CREATE POLICY hc_providers_approved_visible ON public.homecare_providers
FOR SELECT TO authenticated
USING (approval_status = 'approved'::approval_status AND is_active = true);

CREATE POLICY hc_providers_linked_patient_select ON public.homecare_providers
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.homecare_requests r
  WHERE r.provider_id = homecare_providers.id AND r.patient_id = auth.uid()
));

-- Banking columns are never readable through the Data API (server-side/service role only).
REVOKE SELECT (bank_name, account_holder, account_number, branch_code)
  ON public.homecare_providers FROM authenticated;
REVOKE ALL ON public.homecare_providers FROM anon;