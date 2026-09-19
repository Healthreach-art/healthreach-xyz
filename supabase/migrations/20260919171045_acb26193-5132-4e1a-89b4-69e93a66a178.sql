CREATE POLICY "homecare_docs_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'homecare-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "homecare_docs_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'homecare-docs' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "homecare_docs_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homecare-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "homecare_docs_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'homecare-docs' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'homecare-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "homecare_docs_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'homecare-docs' AND (storage.foldername(name))[1] = auth.uid()::text);