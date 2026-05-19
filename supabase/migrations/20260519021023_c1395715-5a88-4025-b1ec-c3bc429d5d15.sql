
CREATE TABLE IF NOT EXISTS public.card_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.card_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own card pin" ON public.card_pins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
