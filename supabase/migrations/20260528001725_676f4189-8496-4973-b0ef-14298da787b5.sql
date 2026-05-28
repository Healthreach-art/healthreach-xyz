REVOKE ALL ON FUNCTION public.dispatch_ready_order_to_drivers(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebroadcast_unaccepted_delivery_orders(integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_delivery_offer_safely(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decline_delivery_offer_safely(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_ready_order_to_drivers(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rebroadcast_unaccepted_delivery_orders(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer_safely(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_delivery_offer_safely(uuid) TO service_role;