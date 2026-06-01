
-- 1) Recreate public.has_role wrapper used by many triggers/policies
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;

-- 2) Patient: add selfie-with-ID for reusable verification
ALTER TABLE public.patient_verifications
  ADD COLUMN IF NOT EXISTS selfie_with_id_path text;

-- 3) Family members: store ID + selfie so patient can order on behalf of others
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS id_document_path text,
  ADD COLUMN IF NOT EXISTS selfie_with_id_path text;
