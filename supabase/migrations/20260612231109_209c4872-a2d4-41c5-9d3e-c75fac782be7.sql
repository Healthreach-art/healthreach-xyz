
GRANT USAGE ON SCHEMA app_private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO anon, authenticated;
