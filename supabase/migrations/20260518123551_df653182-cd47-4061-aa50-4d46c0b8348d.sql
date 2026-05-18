UPDATE medications SET category='Antibiotics' WHERE category='Antibiotic';
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;