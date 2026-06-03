
CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_hour smallint NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour smallint NOT NULL CHECK (end_hour BETWEEN 1 AND 24),
  slot_minutes smallint NOT NULL DEFAULT 60 CHECK (slot_minutes BETWEEN 10 AND 240),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, day_of_week, start_hour)
);
CREATE INDEX IF NOT EXISTS doctor_availability_doctor_idx ON public.doctor_availability(doctor_id);

GRANT SELECT ON public.doctor_availability TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_availability TO authenticated;
GRANT ALL ON public.doctor_availability TO service_role;

ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view doctor availability"
  ON public.doctor_availability FOR SELECT
  USING (true);

CREATE POLICY "Doctors can manage own availability"
  ON public.doctor_availability FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_availability.doctor_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_availability.doctor_id AND d.user_id = auth.uid()));

CREATE POLICY "Admins can manage all availability"
  ON public.doctor_availability FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER doctor_availability_set_updated
  BEFORE UPDATE ON public.doctor_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime so patient pages and doctor dashboard update within seconds
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_appointments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.e_prescriptions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_availability; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.doctor_appointments REPLICA IDENTITY FULL;
ALTER TABLE public.e_prescriptions REPLICA IDENTITY FULL;
ALTER TABLE public.doctor_availability REPLICA IDENTITY FULL;
