
DELETE FROM public.medications WHERE is_demo = true;
DELETE FROM public.doctors WHERE is_demo = true;

DO $$
DECLARE v_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT x.id) INTO v_ids FROM (
    SELECT user_id AS id FROM public.profiles
      WHERE is_demo = true OR lower(email) IN ('jasonbayman5@gmail.com','hlawumal@gmail.com')
    UNION
    SELECT id FROM auth.users
      WHERE lower(email) IN ('jasonbayman5@gmail.com','hlawumal@gmail.com')
  ) x WHERE x.id IS NOT NULL;

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN RETURN; END IF;

  DELETE FROM public.delivery_offers      WHERE pharmacy_id = ANY(v_ids) OR target_driver_id = ANY(v_ids) OR accepted_by = ANY(v_ids);
  DELETE FROM public.deliveries           WHERE driver_id = ANY(v_ids) OR order_id IN (SELECT id FROM public.orders WHERE patient_id = ANY(v_ids) OR pharmacy_id = ANY(v_ids));
  DELETE FROM public.payments             WHERE patient_id = ANY(v_ids) OR order_id IN (SELECT id FROM public.orders WHERE patient_id = ANY(v_ids) OR pharmacy_id = ANY(v_ids));
  DELETE FROM public.order_messages       WHERE sender_id = ANY(v_ids) OR order_id IN (SELECT id FROM public.orders WHERE patient_id = ANY(v_ids) OR pharmacy_id = ANY(v_ids));
  DELETE FROM public.order_group_events   WHERE actor_id = ANY(v_ids);
  DELETE FROM public.order_groups         WHERE patient_id = ANY(v_ids);
  DELETE FROM public.orders               WHERE patient_id = ANY(v_ids) OR pharmacy_id = ANY(v_ids);
  DELETE FROM public.prescription_uploads WHERE patient_id = ANY(v_ids) OR pharmacy_id = ANY(v_ids) OR dispensed_by = ANY(v_ids);
  DELETE FROM public.prescriptions        WHERE patient_id = ANY(v_ids) OR hospital_id = ANY(v_ids);
  DELETE FROM public.e_prescriptions      WHERE patient_id = ANY(v_ids) OR doctor_id = ANY(v_ids);
  DELETE FROM public.doctor_appointments  WHERE patient_id = ANY(v_ids);
  DELETE FROM public.pharmacy_appointments WHERE patient_id = ANY(v_ids) OR pharmacy_id = ANY(v_ids);
  DELETE FROM public.appointment_messages WHERE sender_id = ANY(v_ids) OR patient_id = ANY(v_ids) OR provider_id = ANY(v_ids);
  DELETE FROM public.complaints           WHERE user_id = ANY(v_ids);
  DELETE FROM public.ratings              WHERE patient_id = ANY(v_ids) OR target_id = ANY(v_ids);
  DELETE FROM public.notifications        WHERE user_id = ANY(v_ids);
  DELETE FROM public.medication_reminders WHERE user_id = ANY(v_ids);
  DELETE FROM public.medications          WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.driver_status        WHERE driver_id = ANY(v_ids);
  DELETE FROM public.driver_locations     WHERE driver_id = ANY(v_ids);
  DELETE FROM public.driver_documents     WHERE driver_id = ANY(v_ids);
  DELETE FROM public.driver_bank_accounts WHERE driver_id = ANY(v_ids);
  DELETE FROM public.driver_payouts       WHERE driver_id = ANY(v_ids);
  DELETE FROM public.pharmacy_documents   WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.pharmacy_offers      WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.pharmacy_branches    WHERE pharmacy_id = ANY(v_ids);
  DELETE FROM public.doctor_documents     WHERE doctor_user_id = ANY(v_ids);
  DELETE FROM public.doctors              WHERE user_id = ANY(v_ids);
  DELETE FROM public.family_members       WHERE user_id = ANY(v_ids);
  DELETE FROM public.patient_verifications WHERE user_id = ANY(v_ids);
  DELETE FROM public.user_addresses       WHERE user_id = ANY(v_ids);
  DELETE FROM public.saved_payment_methods WHERE user_id = ANY(v_ids);
  DELETE FROM public.card_pins            WHERE user_id = ANY(v_ids);
  DELETE FROM public.wallet_transactions  WHERE user_id = ANY(v_ids);
  DELETE FROM public.wallets              WHERE user_id = ANY(v_ids);
  DELETE FROM public.user_roles           WHERE user_id = ANY(v_ids);
  DELETE FROM public.profiles             WHERE user_id = ANY(v_ids);
  DELETE FROM auth.users                  WHERE id = ANY(v_ids);
END $$;

CREATE OR REPLACE FUNCTION public.handle_seed_admin_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) IN ('jasonbayman5@gmail.com','hlawumal@gmail.com') THEN
    INSERT INTO public.profiles (user_id, email, full_name, approval_status)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'approved')
    ON CONFLICT (user_id) DO UPDATE SET approval_status = 'approved', email = EXCLUDED.email;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_seed_admin_signup();

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email text,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins insert audit log" ON public.admin_audit_log;
CREATE POLICY "Admins insert audit log" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND admin_id = auth.uid());

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON public.admin_audit_log (action);

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (auth.uid(), v_email, _action, _target_type, _target_id, COALESCE(_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, jsonb) TO authenticated;
