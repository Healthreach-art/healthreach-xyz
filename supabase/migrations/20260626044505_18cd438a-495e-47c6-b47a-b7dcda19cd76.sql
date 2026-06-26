-- Harden storage RLS for avatars and doctor-docs.

DROP POLICY IF EXISTS "Avatar user upload" ON storage.objects;
DROP POLICY IF EXISTS "Avatar user update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar user delete" ON storage.objects;
DROP POLICY IF EXISTS "Avatar authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Avatar authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar authenticated delete" ON storage.objects;

CREATE POLICY "Avatar authenticated upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR position(auth.uid()::text in name) > 0
    )
  );

CREATE POLICY "Avatar authenticated update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR position(auth.uid()::text in name) > 0
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR position(auth.uid()::text in name) > 0
    )
  );

CREATE POLICY "Avatar authenticated delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR position(auth.uid()::text in name) > 0
    )
  );

DROP POLICY IF EXISTS "Doctors upload their docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctors read their docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctors update their docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctors delete their docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins read doctor docs" ON storage.objects;

CREATE POLICY "Doctors upload their docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'doctor-docs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Doctors read their docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'doctor-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "Doctors update their docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'doctor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'doctor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Doctors delete their docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'doctor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
