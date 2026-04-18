ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;