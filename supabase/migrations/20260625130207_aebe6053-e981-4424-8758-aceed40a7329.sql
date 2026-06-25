
CREATE TABLE IF NOT EXISTS public.admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_email text,
  note text,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_invites TO authenticated;
GRANT ALL ON public.admin_invites TO service_role;

ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read invites" ON public.admin_invites
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert invites" ON public.admin_invites
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update invites" ON public.admin_invites
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete invites" ON public.admin_invites
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admin RPC: invite a new admin by email
CREATE OR REPLACE FUNCTION public.invite_admin(_email text, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(_email));
  v_existing uuid;
  v_caller_email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();

  -- If user already exists, just grant admin immediately
  SELECT id INTO v_existing FROM auth.users WHERE lower(email) = v_email;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_existing, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
    VALUES (auth.uid(), v_caller_email, 'admin.grant_existing', 'user', v_existing::text,
            jsonb_build_object('email', v_email));

    RETURN jsonb_build_object('ok', true, 'granted', true, 'user_id', v_existing);
  END IF;

  INSERT INTO public.admin_invites (email, invited_by, invited_by_email, note)
  VALUES (v_email, auth.uid(), v_caller_email, _note)
  ON CONFLICT (email) DO UPDATE
    SET invited_by = EXCLUDED.invited_by,
        invited_by_email = EXCLUDED.invited_by_email,
        note = COALESCE(EXCLUDED.note, public.admin_invites.note),
        used_at = NULL,
        used_by = NULL;

  INSERT INTO public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (auth.uid(), v_caller_email, 'admin.invite', 'email', v_email,
          jsonb_build_object('email', v_email, 'note', _note));

  RETURN jsonb_build_object('ok', true, 'invited', true);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_admin_invite(_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller_email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  DELETE FROM public.admin_invites WHERE lower(email) = lower(btrim(_email));
  INSERT INTO public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (auth.uid(), v_caller_email, 'admin.invite_revoke', 'email', lower(btrim(_email)),
          jsonb_build_object('email', lower(btrim(_email))));
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.invite_admin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin_invite(text) TO authenticated;

-- Update the signup trigger so invited emails are auto-promoted on signup
CREATE OR REPLACE FUNCTION public.handle_seed_admin_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lower text := lower(NEW.email);
  v_is_seed boolean := v_lower IN ('jasonbayman5@gmail.com','hlawumal@gmail.com');
  v_invited boolean := EXISTS (SELECT 1 FROM public.admin_invites WHERE lower(email) = v_lower AND used_at IS NULL);
BEGIN
  IF v_is_seed OR v_invited THEN
    INSERT INTO public.profiles (user_id, email, full_name, approval_status)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'approved')
    ON CONFLICT (user_id) DO UPDATE SET approval_status = 'approved', email = EXCLUDED.email;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    IF v_invited THEN
      UPDATE public.admin_invites
        SET used_at = now(), used_by = NEW.id
        WHERE lower(email) = v_lower;

      INSERT INTO public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
      VALUES (NEW.id, NEW.email, 'admin.invite_accepted', 'user', NEW.id::text,
              jsonb_build_object('email', NEW.email));
    END IF;
  END IF;
  RETURN NEW;
END $$;
