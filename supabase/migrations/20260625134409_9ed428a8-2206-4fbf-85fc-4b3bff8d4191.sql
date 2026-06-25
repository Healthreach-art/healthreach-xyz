-- Allow drivers to read & upsert their own verification documents
GRANT SELECT, INSERT, UPDATE ON public.driver_documents TO authenticated;

DROP POLICY IF EXISTS "Drivers manage their own documents" ON public.driver_documents;
CREATE POLICY "Drivers manage their own documents"
ON public.driver_documents
FOR ALL
TO authenticated
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "Drivers view their own documents" ON public.driver_documents;
CREATE POLICY "Drivers view their own documents"
ON public.driver_documents
FOR SELECT
TO authenticated
USING (driver_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Remove anonymous SELECT on doctor_reviews (security finding)
DROP POLICY IF EXISTS "Anyone view doctor reviews" ON public.doctor_reviews;
DROP POLICY IF EXISTS "Public can view doctor reviews" ON public.doctor_reviews;

CREATE POLICY "Authenticated users view doctor reviews"
ON public.doctor_reviews
FOR SELECT
TO authenticated
USING (true);
