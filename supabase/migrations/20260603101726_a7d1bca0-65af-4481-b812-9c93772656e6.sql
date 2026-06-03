
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS appointments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS walkins_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS opening_hours text NOT NULL DEFAULT '';

-- Allow public to discover active pharmacies for the unified search/AI matcher
DROP POLICY IF EXISTS "Public can view pharmacy directory" ON public.profiles;
CREATE POLICY "Public can view pharmacy directory"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (organization_name IS NOT NULL AND organization_name <> '' AND approval_status = 'approved');
