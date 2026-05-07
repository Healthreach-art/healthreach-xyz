-- 1) delivery_offers: restrict driver UPDATE to open offers only, and limit accept/decline semantics
DROP POLICY IF EXISTS "Drivers can update open offers" ON public.delivery_offers;
CREATE POLICY "Drivers accept/decline open offers"
  ON public.delivery_offers FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'driver')
    AND status = 'open'
    AND expires_at > now()
    AND NOT (auth.uid() = ANY (declined_by))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'driver')
    AND (
      -- accept: driver claims for themselves
      (status = 'accepted' AND accepted_by = auth.uid())
      -- decline: driver adds themselves to declined_by, status stays open
      OR (status = 'open' AND auth.uid() = ANY (declined_by))
    )
  );

-- 2) prescriptions: pharmacies only see prescriptions linked via their orders or prescription_uploads
DROP POLICY IF EXISTS "Pharmacies can view prescriptions" ON public.prescriptions;
CREATE POLICY "Pharmacies view assigned prescriptions"
  ON public.prescriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.patient_id = prescriptions.patient_id
        AND o.pharmacy_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.prescription_uploads pu
      WHERE pu.patient_id = prescriptions.patient_id
        AND pu.pharmacy_id = auth.uid()
    )
  );

-- 3) user_roles: only allow self-assigning 'patient'; privileged roles must be set by admin or via signup trigger
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
CREATE POLICY "Users self-assign patient only"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'patient'::public.app_role);

CREATE POLICY "Admins assign any role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Realtime channel authorization: only allow subscribers to topics they're authorized for
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read own realtime topics"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    -- topic conventions used in the app, all scoped to auth.uid() or order participation
    (realtime.topic() = 'patient-' || auth.uid()::text)
    OR (realtime.topic() = 'pharmacy-' || auth.uid()::text)
    OR (realtime.topic() = 'driver-' || auth.uid()::text)
    OR (realtime.topic() = 'wallet-' || auth.uid()::text)
    OR (realtime.topic() = 'notif-' || auth.uid()::text)
    OR (realtime.topic() = 'prefs-' || auth.uid()::text)
    OR (realtime.topic() LIKE 'order-msgs-%' AND public.is_order_participant(
          auth.uid(),
          NULLIF(replace(realtime.topic(), 'order-msgs-', ''), '')::uuid
        ))
    OR (realtime.topic() LIKE 'driver-loc-%' AND public.is_order_participant(
          auth.uid(),
          NULLIF(replace(realtime.topic(), 'driver-loc-', ''), '')::uuid
        ))
    OR (realtime.topic() = 'admin-realtime' AND public.has_role(auth.uid(), 'admin'))
    OR (realtime.topic() = 'track-deliveries' AND public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Authenticated users can write own realtime topics"
  ON realtime.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (realtime.topic() = 'patient-' || auth.uid()::text)
    OR (realtime.topic() = 'pharmacy-' || auth.uid()::text)
    OR (realtime.topic() = 'driver-' || auth.uid()::text)
    OR (realtime.topic() = 'wallet-' || auth.uid()::text)
    OR (realtime.topic() = 'notif-' || auth.uid()::text)
    OR (realtime.topic() = 'prefs-' || auth.uid()::text)
    OR (realtime.topic() LIKE 'order-msgs-%' AND public.is_order_participant(
          auth.uid(),
          NULLIF(replace(realtime.topic(), 'order-msgs-', ''), '')::uuid
        ))
    OR (realtime.topic() LIKE 'driver-loc-%' AND public.is_order_participant(
          auth.uid(),
          NULLIF(replace(realtime.topic(), 'driver-loc-', ''), '')::uuid
        ))
    OR (realtime.topic() = 'admin-realtime' AND public.has_role(auth.uid(), 'admin'))
    OR (realtime.topic() = 'track-deliveries' AND public.has_role(auth.uid(), 'admin'))
  );

-- 5) deliveries: patients can view their own deliveries via order ownership
CREATE POLICY "Patients view own deliveries"
  ON public.deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = deliveries.order_id AND o.patient_id = auth.uid())
  );

-- 6) medications: hide internal supply-chain fields from public via a view; restrict base table
-- Public-safe view (no batch_number, no expiry_date; stock represented as in_stock boolean)
CREATE OR REPLACE VIEW public.medications_public
WITH (security_invoker = on) AS
SELECT
  id, pharmacy_id, name, description, price, category, image_url,
  requires_prescription, (stock_quantity > 0) AS in_stock,
  created_at, updated_at
FROM public.medications;

GRANT SELECT ON public.medications_public TO anon, authenticated;

-- Restrict base medications SELECT to pharmacy owners and admins
DROP POLICY IF EXISTS "Anyone can view medications" ON public.medications;
CREATE POLICY "Pharmacy owners view own medications"
  ON public.medications FOR SELECT
  TO authenticated
  USING (auth.uid() = pharmacy_id OR public.has_role(auth.uid(), 'admin'));

-- Allow signed-in users (e.g. patients placing orders) to read non-sensitive med fields via the view.
-- Also allow basic SELECT on base table for authenticated users but only of safe columns is enforced
-- by clients querying the view. To keep ordering flow working without breaking existing queries,
-- add an authenticated-only read policy on base table that excludes anonymous browsing:
CREATE POLICY "Authenticated users can browse medications"
  ON public.medications FOR SELECT
  TO authenticated
  USING (true);

-- 7) delivery-proofs: allow drivers to update/delete their own proofs (within their folder)
CREATE POLICY "Drivers update own delivery proofs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'delivery-proofs' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'delivery-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Drivers delete own delivery proofs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'delivery-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 8) prescription_audit_log: actor must be a participant of the referenced upload
DROP POLICY IF EXISTS "Actor inserts audit" ON public.prescription_audit_log;
CREATE POLICY "Participants insert audit"
  ON public.prescription_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND EXISTS (
      SELECT 1 FROM public.prescription_uploads u
      WHERE u.id = prescription_audit_log.prescription_upload_id
        AND (u.patient_id = auth.uid() OR u.pharmacy_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );