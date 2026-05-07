
-- Complaints table
CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid,
  subject text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'open',
  admin_response text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own complaints" ON public.complaints FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own complaints" ON public.complaints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all complaints" ON public.complaints FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_complaints_updated_at BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ratings table (pharmacy + driver)
CREATE TABLE IF NOT EXISTS public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  target_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('pharmacy','driver')),
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, target_type, patient_id)
);
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient create own ratings" ON public.ratings FOR INSERT WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Anyone view ratings" ON public.ratings FOR SELECT USING (true);
CREATE POLICY "Admins manage ratings" ON public.ratings FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ratings_target ON public.ratings(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);
