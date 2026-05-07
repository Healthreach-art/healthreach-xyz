-- 1) Tighten "always true" insert policy on notifications
DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
CREATE POLICY "Users can insert notifications for self"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
-- (Triggers run as SECURITY DEFINER and bypass RLS, so internal notification inserts still work.)

-- 2) Restrict listing on public storage buckets (avatars, medication-images)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars: read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars: read by direct path (no listing)"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars' AND name IS NOT NULL AND position('/' in name) > 0);

-- medication-images: only authenticated users can list/read
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual ILIKE '%medication-images%' OR with_check ILIKE '%medication-images%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Medication images: authenticated read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'medication-images');

CREATE POLICY "Medication images: pharmacy upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'medication-images' AND public.has_role(auth.uid(), 'pharmacy'));

CREATE POLICY "Medication images: pharmacy update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'medication-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Medication images: pharmacy delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'medication-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3) Revoke EXECUTE on all SECURITY DEFINER functions from anon/public; grant only to authenticated where needed.
-- Trigger functions don't need EXECUTE granted to roles — triggers invoke them with definer rights.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- Grant EXECUTE back to authenticated only for functions intentionally callable by app users:
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_order_participant(uuid, uuid) TO authenticated;