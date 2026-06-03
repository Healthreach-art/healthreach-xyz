
DROP POLICY IF EXISTS "Public can view pharmacy directory" ON public.profiles;

CREATE OR REPLACE VIEW public.pharmacy_directory
WITH (security_invoker = false) AS
SELECT
  user_id,
  organization_name,
  full_name,
  address,
  phone,
  latitude,
  longitude,
  services,
  services_tags,
  appointments_enabled,
  walkins_enabled,
  opening_hours,
  approval_status,
  created_at
FROM public.profiles
WHERE organization_name IS NOT NULL
  AND organization_name <> ''
  AND approval_status = 'approved';

GRANT SELECT ON public.pharmacy_directory TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone view ratings" ON public.ratings;
CREATE POLICY "Authenticated can view ratings"
  ON public.ratings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Patients view own prescription audit" ON public.prescription_audit_log;
CREATE POLICY "Patients view own prescription audit"
  ON public.prescription_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescription_uploads u
      WHERE u.id = prescription_audit_log.prescription_upload_id
        AND u.patient_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Drivers view assigned orders" ON public.orders;
CREATE POLICY "Drivers view assigned orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.order_id = orders.id
        AND d.driver_id = auth.uid()
    )
  );
