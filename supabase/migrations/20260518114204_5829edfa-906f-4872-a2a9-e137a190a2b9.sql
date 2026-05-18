
-- Family members
CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  relationship text NOT NULL DEFAULT 'family',
  date_of_birth date,
  allergies text DEFAULT '',
  conditions text DEFAULT '',
  notes text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own family"
  ON public.family_members FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all family"
  ON public.family_members FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_family_members_updated_at
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pharmacy appointments
CREATE TABLE public.pharmacy_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  pharmacy_id uuid NOT NULL,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  preferred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  mode text NOT NULL DEFAULT 'in_person',
  pharmacist_notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pharmacy_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients view own appointments"
  ON public.pharmacy_appointments FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Patients create own appointments"
  ON public.pharmacy_appointments FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patients update own appointments"
  ON public.pharmacy_appointments FOR UPDATE
  USING (auth.uid() = patient_id);

CREATE POLICY "Pharmacies view their appointments"
  ON public.pharmacy_appointments FOR SELECT
  USING (auth.uid() = pharmacy_id);

CREATE POLICY "Pharmacies update their appointments"
  ON public.pharmacy_appointments FOR UPDATE
  USING (auth.uid() = pharmacy_id);

CREATE POLICY "Admins manage all appointments"
  ON public.pharmacy_appointments FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pharmacy_appointments_updated_at
  BEFORE UPDATE ON public.pharmacy_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_family_members_user ON public.family_members(user_id);
CREATE INDEX idx_appointments_patient ON public.pharmacy_appointments(patient_id);
CREATE INDEX idx_appointments_pharmacy ON public.pharmacy_appointments(pharmacy_id);
