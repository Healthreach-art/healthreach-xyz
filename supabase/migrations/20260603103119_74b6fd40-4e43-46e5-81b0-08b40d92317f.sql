
DROP POLICY IF EXISTS "Doctors can read own docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctors can upload own docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctors can update own docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctors can delete own docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all doctor docs" ON storage.objects;

CREATE POLICY "Doctors can read own docs" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'doctor-docs' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Doctors can upload own docs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'doctor-docs' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Doctors can update own docs" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'doctor-docs' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Doctors can delete own docs" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'doctor-docs' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Admins can read all doctor docs" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'doctor-docs' AND public.has_role(auth.uid(), 'admin'::app_role)
  );
