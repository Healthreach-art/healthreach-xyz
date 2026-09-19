-- 1. Home-care provider banking details: stop exposing full rows to every signed-in user.
DROP POLICY IF EXISTS hc_providers_approved_visible ON public.homecare_providers;

CREATE OR REPLACE VIEW public.homecare_providers_public AS
SELECT id, provider_type, business_name, full_name, contact_person, phone, address,
       latitude, longitude, service_areas, services, operating_hours, availability,
       pricing_notes, hourly_rate, qualifications, certifications,
       approval_status, is_active, service_radius_km, created_at
FROM public.homecare_providers;

ALTER VIEW public.homecare_providers_public SET (security_invoker = false);
REVOKE ALL ON public.homecare_providers_public FROM anon;
GRANT SELECT ON public.homecare_providers_public TO authenticated;
GRANT SELECT ON public.homecare_providers_public TO service_role;

-- patients can still see the provider linked to their own request (safe columns only via the view)
CREATE POLICY hc_providers_linked_patient_select ON public.homecare_providers
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.homecare_requests r
  WHERE r.provider_id = homecare_providers.id AND r.patient_id = auth.uid()
) AND false);
DROP POLICY IF EXISTS hc_providers_linked_patient_select ON public.homecare_providers;

-- 2. driver_status: scope pharmacy visibility to drivers working that pharmacy's jobs.
DROP POLICY IF EXISTS "Pharmacies view driver status" ON public.driver_status;
CREATE POLICY "Pharmacies view assigned driver status" ON public.driver_status
FOR SELECT TO authenticated
USING (
  app_private.has_role(auth.uid(), 'pharmacy'::app_role)
  AND (
    EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.orders o ON o.id = d.order_id
      WHERE d.driver_id = driver_status.driver_id
        AND o.pharmacy_id = auth.uid()
        AND d.status NOT IN ('delivered'::delivery_status, 'failed'::delivery_status)
    )
    OR EXISTS (
      SELECT 1 FROM public.delivery_offers f
      WHERE f.pharmacy_id = auth.uid()
        AND f.status IN ('open'::offer_status, 'accepted'::offer_status)
        AND (f.target_driver_id = driver_status.driver_id OR f.accepted_by = driver_status.driver_id)
    )
  )
);

-- 3. ratings: only the reviewer, the rated party and admins may read rows.
DROP POLICY IF EXISTS "Authenticated can view ratings" ON public.ratings;
CREATE POLICY "Participants view ratings" ON public.ratings
FOR SELECT TO authenticated
USING (
  auth.uid() = patient_id
  OR auth.uid() = target_id
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
);

-- 4. notifications: creation stays server-side / admin only; drop any anon privileges.
REVOKE ALL ON public.notifications FROM anon;

-- 5. SECURITY DEFINER functions: deny-by-default execution, then re-grant only the RPCs the app calls.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'accept_delivery_offer_for_driver','accept_delivery_offer_safely','accept_pharmacy_offer',
        'admin_set_pharmacy_document_review','cancel_order_safely','claim_prescription_for_pharmacy',
        'clear_patient_order_history','consume_prescription_repeat','decline_delivery_offer_for_driver',
        'decline_delivery_offer_safely','decline_pharmacy_offer','dispatch_ready_order_to_drivers',
        'find_homecare_near','find_pharmacies_near','find_pharmacy_with_all_meds',
        'get_order_driver_contact','get_order_group_timeline','get_pharmacy_directory',
        'hide_order_group_for_patient','invite_admin','log_admin_action','pharmacy_resubmit_document',
        'rebroadcast_unaccepted_delivery_orders','revoke_admin_invite','wallet_credit','wallet_debit'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;