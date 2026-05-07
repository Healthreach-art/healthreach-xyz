
-- Medication reminders table for refill alerts and dose reminders
CREATE TABLE public.medication_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT DEFAULT '',
  frequency TEXT NOT NULL DEFAULT 'daily', -- daily, weekly, monthly
  time_of_day TIME,
  next_refill_date DATE,
  days_supply INTEGER DEFAULT 30,
  is_chronic BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reminders" ON public.medication_reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view reminders" ON public.medication_reminders
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_med_reminders_updated_at
  BEFORE UPDATE ON public.medication_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add label column extras to user_addresses if not present
ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
