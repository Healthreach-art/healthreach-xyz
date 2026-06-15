CREATE OR REPLACE FUNCTION public.user_has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_any_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_any_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_any_role(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users self-assign patient only" ON public.user_roles;
CREATE POLICY "New users self-assign one non-admin role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('patient'::public.app_role, 'pharmacy'::public.app_role, 'hospital'::public.app_role, 'driver'::public.app_role, 'doctor'::public.app_role)
    AND NOT public.user_has_any_role(auth.uid())
  );