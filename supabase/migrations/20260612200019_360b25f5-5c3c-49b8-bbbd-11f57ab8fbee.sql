-- Allow authenticated users (patients, etc.) to view provider profiles (pharmacy, doctor, hospital)
-- so the public storefront / booking pages can load name, address, services, hours, etc.
CREATE POLICY "Anyone can view provider profiles"
ON public.profiles
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = profiles.user_id
      AND ur.role IN ('pharmacy','doctor','hospital')
  )
);

GRANT SELECT ON public.user_roles TO anon;