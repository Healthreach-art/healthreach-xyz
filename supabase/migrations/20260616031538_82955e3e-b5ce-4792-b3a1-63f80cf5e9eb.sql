
-- 1. doctor_availability: require auth + approved/active doctor
DROP POLICY IF EXISTS "Anyone can view doctor availability" ON public.doctor_availability;
CREATE POLICY "Authenticated users view active doctor availability"
ON public.doctor_availability
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.id = doctor_availability.doctor_id
      AND d.is_active = true
      AND d.is_verified = true
  )
);

-- 2. medications: tighten broad SELECT and hide sensitive cols from non-owners
DROP POLICY IF EXISTS "Authenticated users can browse medications" ON public.medications;
CREATE POLICY "Authenticated users browse in-stock approved medications"
ON public.medications
FOR SELECT
TO authenticated
USING (
  stock_quantity > 0
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = medications.pharmacy_id
      AND p.approval_status = 'approved'
  )
);

-- Hide sensitive operational columns from general authenticated reads.
-- Pharmacy owners and admins read these through server functions (service_role).
REVOKE SELECT (batch_number, expiry_date) ON public.medications FROM authenticated;

-- 3. order_group_events: explicitly block client inserts/updates/deletes.
-- Writes happen through SECURITY DEFINER triggers / service_role only.
CREATE POLICY "Block client inserts on order_group_events"
ON public.order_group_events
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Block client updates on order_group_events"
ON public.order_group_events
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Block client deletes on order_group_events"
ON public.order_group_events
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. realtime authorization for appointment message channels (appt-msgs-{appointmentId})
CREATE POLICY "Appointment participants read appt-msgs realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'appt-msgs-%')
  AND EXISTS (
    SELECT 1 FROM public.appointment_messages am
    WHERE am.appointment_id::text = substring(realtime.topic() from 11)
      AND (am.patient_id = auth.uid() OR am.provider_id = auth.uid())
    LIMIT 1
  )
);
