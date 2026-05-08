CREATE SCHEMA IF NOT EXISTS app_private;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA app_private;

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON SCHEMA app_private FROM anon;
REVOKE EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) FROM anon;