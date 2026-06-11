ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_doctors_is_demo ON public.doctors(is_demo) WHERE is_demo = true;

UPDATE public.doctors d
SET is_demo = true, is_active = true, is_verified = true, verified_at = COALESCE(d.verified_at, now())
FROM public.profiles p
WHERE p.user_id = d.user_id AND p.is_demo = true AND d.is_demo = false;