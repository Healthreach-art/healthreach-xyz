
CREATE TABLE public.user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  street text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own addresses select" ON public.user_addresses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own addresses insert" ON public.user_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own addresses update" ON public.user_addresses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own addresses delete" ON public.user_addresses FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ensure_single_default_address()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.user_addresses SET is_default = false WHERE user_id = NEW.user_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_single_default_address AFTER INSERT OR UPDATE ON public.user_addresses
FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION public.ensure_single_default_address();
