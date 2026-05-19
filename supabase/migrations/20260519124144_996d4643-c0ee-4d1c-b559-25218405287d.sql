ALTER TABLE public.pharmacy_offers REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_offers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;