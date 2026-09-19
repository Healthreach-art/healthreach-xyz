-- internal trigger routines: not callable by anyone through the API
REVOKE ALL ON FUNCTION public.guard_homecare_self_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_homecare_request_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_homecare_request_status() FROM PUBLIC, anon, authenticated;

-- helpers used by policies / app: signed-in users only
REVOKE ALL ON FUNCTION public.is_homecare_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_homecare_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.homecare_company_id_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.homecare_company_id_for(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.find_homecare_near(double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_homecare_near(double precision, double precision, integer) TO authenticated;