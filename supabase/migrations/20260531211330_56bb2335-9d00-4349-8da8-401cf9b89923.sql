ALTER TABLE public.patient_verifications
  ADD COLUMN IF NOT EXISTS id_number text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_family_member_id uuid;
