-- Allow public (anon) read of active doctors and their reviews for SEO-friendly public profile pages.
GRANT SELECT ON public.doctors TO anon;
GRANT SELECT ON public.doctor_reviews TO anon;

CREATE POLICY "Public can view active doctors"
ON public.doctors
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "Public can view doctor reviews"
ON public.doctor_reviews
FOR SELECT
TO anon
USING (true);