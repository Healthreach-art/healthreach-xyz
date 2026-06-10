
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hidden_for_patient_at timestamptz;
ALTER TABLE public.order_groups ADD COLUMN IF NOT EXISTS hidden_for_patient_at timestamptz;

CREATE OR REPLACE FUNCTION public.hide_order_group_for_patient(_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_patient uuid;
BEGIN
  SELECT patient_id INTO v_patient FROM public.order_groups WHERE id = _group_id;
  IF v_patient IS NULL THEN
    -- Legacy: not a group, treat _group_id as an order id
    UPDATE public.orders SET hidden_for_patient_at = now()
     WHERE id = _group_id AND patient_id = auth.uid()
       AND status::text IN ('delivered','cancelled','rejected');
    RETURN jsonb_build_object('ok', true, 'mode', 'order');
  END IF;
  IF v_patient <> auth.uid() THEN RAISE EXCEPTION 'Not your order'; END IF;
  UPDATE public.order_groups SET hidden_for_patient_at = now() WHERE id = _group_id;
  UPDATE public.orders SET hidden_for_patient_at = now() WHERE order_group_id = _group_id;
  RETURN jsonb_build_object('ok', true, 'mode', 'group');
END $$;

CREATE OR REPLACE FUNCTION public.clear_patient_order_history()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_orders int; v_groups int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.order_groups SET hidden_for_patient_at = now()
   WHERE patient_id = auth.uid()
     AND hidden_for_patient_at IS NULL
     AND status::text IN ('delivered','cancelled','rejected');
  GET DIAGNOSTICS v_groups = ROW_COUNT;
  UPDATE public.orders SET hidden_for_patient_at = now()
   WHERE patient_id = auth.uid()
     AND hidden_for_patient_at IS NULL
     AND status::text IN ('delivered','cancelled','rejected');
  GET DIAGNOSTICS v_orders = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'groups', v_groups, 'orders', v_orders);
END $$;
