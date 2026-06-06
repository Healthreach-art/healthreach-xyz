-- Allow patients to edit / delete their own ratings (unique indexes already enforce one rating per service)
CREATE POLICY "Patient update own ratings" ON public.ratings
  FOR UPDATE TO authenticated
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patient delete own ratings" ON public.ratings
  FOR DELETE TO authenticated
  USING (auth.uid() = patient_id);