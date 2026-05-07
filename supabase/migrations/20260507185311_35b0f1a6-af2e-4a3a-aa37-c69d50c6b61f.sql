-- Public buckets serve files via public URL without needing a SELECT policy.
-- Removing the broad SELECT policies prevents API-based listing while still
-- allowing direct public URL access for avatars and medication images.
DROP POLICY IF EXISTS "Avatars: read own" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: read by direct path (no listing)" ON storage.objects;
DROP POLICY IF EXISTS "Medication images: authenticated read" ON storage.objects;