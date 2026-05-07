
-- Prescription uploads: patients can only create as 'pending'
DROP POLICY IF EXISTS "Patients insert own prescription uploads" ON public.prescription_uploads;
CREATE POLICY "Patients insert own prescription uploads"
ON public.prescription_uploads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = patient_id AND status = 'pending'::prescription_upload_status);

-- Payments: patients can only create as 'pending' or 'failed'
DROP POLICY IF EXISTS "Patients can create payments" ON public.payments;
CREATE POLICY "Patients can create payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = patient_id
  AND status IN ('pending'::payment_status, 'failed'::payment_status)
);

-- Notifications: remove user self-insert; only admins can insert (triggers run as definer)
DROP POLICY IF EXISTS "Users can insert notifications for self" ON public.notifications;
CREATE POLICY "Admins insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Delivery offers: drivers only see open, non-expired, not-declined-by-them, not accepted by someone else
DROP POLICY IF EXISTS "Drivers can view open offers" ON public.delivery_offers;
CREATE POLICY "Drivers can view open offers"
ON public.delivery_offers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'driver'::app_role)
  AND status = 'open'::offer_status
  AND expires_at > now()
  AND NOT (auth.uid() = ANY (declined_by))
  AND (accepted_by IS NULL OR accepted_by = auth.uid())
);
