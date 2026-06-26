
-- Rebuild avatars upload/update/delete policies with a simpler, explicit prefix check
DROP POLICY IF EXISTS "Avatar authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Avatar authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: public read" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: user upload own folder" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: user update own folder" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: user delete own folder" ON storage.objects;

CREATE POLICY "Avatars: public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Avatars: user upload own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE (auth.uid()::text || '/%')
);

CREATE POLICY "Avatars: user update own folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE (auth.uid()::text || '/%')
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE (auth.uid()::text || '/%')
);

CREATE POLICY "Avatars: user delete own folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE (auth.uid()::text || '/%')
);
