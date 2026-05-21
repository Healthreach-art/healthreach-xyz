-- RPC: allow order participants (patient/pharmacy/driver) to read minimal
-- contact info (name, avatar, phone) for the driver assigned to an order.
CREATE OR REPLACE FUNCTION public.get_order_driver_contact(_order_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, phone text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_order_participant(auth.uid(), _order_id)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.user_id, p.full_name, COALESCE(p.avatar_url,'') AS avatar_url, COALESCE(p.phone,'') AS phone
  FROM public.deliveries d
  JOIN public.profiles p ON p.user_id = d.driver_id
  WHERE d.order_id = _order_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_driver_contact(uuid) TO authenticated;
