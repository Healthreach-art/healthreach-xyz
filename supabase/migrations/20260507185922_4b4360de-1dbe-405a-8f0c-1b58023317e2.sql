-- RLS policies execute functions with the table owner's privileges, independent
-- of EXECUTE grants. Revoke EXECUTE from authenticated/anon/PUBLIC on the
-- helper SECURITY DEFINER functions; policies continue to work.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_order_participant(uuid, uuid) FROM PUBLIC, anon, authenticated;