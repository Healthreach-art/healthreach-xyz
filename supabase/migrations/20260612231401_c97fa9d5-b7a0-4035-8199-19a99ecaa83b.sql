CREATE OR REPLACE FUNCTION app_private.is_provider(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('pharmacy'::app_role, 'doctor'::app_role, 'hospital'::app_role)
  )
$$;

GRANT EXECUTE ON FUNCTION app_private.is_provider(uuid) TO anon, authenticated;

DROP POLICY "Anyone can view provider profiles" ON public.profiles;
CREATE POLICY "Anyone can view provider profiles"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (app_private.is_provider(user_id));