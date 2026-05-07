
-- 1. handle_new_user: only allow non-privileged roles via metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, '')
  );

  requested_role := NEW.raw_user_meta_data ->> 'role';

  -- Only allow self-assignment of non-privileged roles. 'admin' must be granted manually.
  IF requested_role IN ('patient', 'pharmacy', 'hospital', 'driver') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, requested_role::public.app_role);

    IF requested_role IN ('pharmacy', 'hospital', 'driver') THEN
      UPDATE public.profiles SET approval_status = 'pending' WHERE user_id = NEW.id;
    END IF;
  ELSE
    -- Default to patient if role is missing or disallowed
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'patient'::public.app_role);
  END IF;

  RETURN NEW;
END;
$function$;

-- Reinforce: user_roles self-insert policy already restricts to 'patient' only (kept).

-- 2. Lock payment status on patient updates
DROP POLICY IF EXISTS "Patients can update own pending payments" ON public.payments;
CREATE POLICY "Patients can update own pending payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (auth.uid() = patient_id AND status IN ('pending'::payment_status, 'failed'::payment_status))
WITH CHECK (
  auth.uid() = patient_id
  AND status IN ('pending'::payment_status, 'failed'::payment_status)
);

-- Hard guard: prevent any non-admin from transitioning payments.status to completed/refunded via trigger
CREATE OR REPLACE FUNCTION public.guard_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text IN ('completed', 'refunded') AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Payment status transition to % is not permitted from client', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_payment_status_transition_trg ON public.payments;
CREATE TRIGGER guard_payment_status_transition_trg
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_payment_status_transition();

-- 3. Lock prescription_uploads status on patient updates
DROP POLICY IF EXISTS "Patients update own pending uploads" ON public.prescription_uploads;
CREATE POLICY "Patients update own pending uploads"
ON public.prescription_uploads
FOR UPDATE
TO authenticated
USING (
  auth.uid() = patient_id
  AND status IN ('pending'::prescription_upload_status, 'reupload_requested'::prescription_upload_status)
)
WITH CHECK (
  auth.uid() = patient_id
  AND status IN ('pending'::prescription_upload_status, 'reupload_requested'::prescription_upload_status)
);

-- Hard guard: prevent patient from setting status to approved/rejected/expired
CREATE OR REPLACE FUNCTION public.guard_prescription_upload_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text IN ('approved', 'rejected', 'expired')
       AND auth.uid() = OLD.patient_id
       AND auth.uid() <> OLD.pharmacy_id
       AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Patients cannot transition prescription status to %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_prescription_upload_status_trg ON public.prescription_uploads;
CREATE TRIGGER guard_prescription_upload_status_trg
BEFORE UPDATE ON public.prescription_uploads
FOR EACH ROW EXECUTE FUNCTION public.guard_prescription_upload_status();

-- 4. Server-side price validation on orders: re-derive total_amount from medication price
CREATE OR REPLACE FUNCTION public.validate_order_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  med_price numeric;
  expected_subtotal numeric;
  expected_total numeric;
  base_delivery numeric;
BEGIN
  IF NEW.medication_id IS NOT NULL THEN
    SELECT price INTO med_price FROM public.medications WHERE id = NEW.medication_id;
    IF med_price IS NULL THEN
      RAISE EXCEPTION 'Medication % not found', NEW.medication_id;
    END IF;

    -- Customer price = base * 1.15 (matches client lib/pricing). Delivery customer fee = base * 1.07.
    base_delivery := COALESCE(NEW.delivery_fee, 50);
    expected_subtotal := round(med_price * 1.15 * NEW.quantity * 100) / 100;
    expected_total := round((expected_subtotal + base_delivery * 1.07) * 100) / 100;

    -- Allow small float tolerance
    IF abs(COALESCE(NEW.total_amount, 0) - expected_total) > 0.50 THEN
      -- Override with authoritative server-computed total instead of failing
      NEW.total_amount := expected_total;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_pricing_trg ON public.orders;
CREATE TRIGGER validate_order_pricing_trg
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_order_pricing();

-- Same guard on payments insert: amount and total_paid must match the order's total_amount
CREATE OR REPLACE FUNCTION public.validate_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  order_total numeric;
BEGIN
  SELECT total_amount INTO order_total FROM public.orders WHERE id = NEW.order_id;
  IF order_total IS NULL THEN
    RAISE EXCEPTION 'Order % not found', NEW.order_id;
  END IF;
  -- Force amount and total_paid to match the order's authoritative total
  NEW.amount := order_total;
  NEW.total_paid := order_total;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_payment_amount_trg ON public.payments;
CREATE TRIGGER validate_payment_amount_trg
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_amount();
