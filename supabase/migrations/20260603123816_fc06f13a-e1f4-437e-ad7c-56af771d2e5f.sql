
-- Free-text service descriptions + AI-extracted tags for matching
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS services_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS services_tags text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS services_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS services_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS subspecialties text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_profiles_services_tags ON public.profiles USING GIN (services_tags);
CREATE INDEX IF NOT EXISTS idx_doctors_services_tags ON public.doctors USING GIN (services_tags);
CREATE INDEX IF NOT EXISTS idx_doctors_subspecialties ON public.doctors USING GIN (subspecialties);
