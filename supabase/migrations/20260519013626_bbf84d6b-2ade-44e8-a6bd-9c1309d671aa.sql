DO $$
DECLARE
  demo_users uuid[] := ARRAY[
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    'a0000001-0000-0000-0000-000000000001'::uuid,
    'a0000001-0000-0000-0000-000000000002'::uuid,
    'a0000001-0000-0000-0000-000000000003'::uuid,
    'a0000001-0000-0000-0000-000000000004'::uuid,
    'a0000001-0000-0000-0000-000000000005'::uuid,
    'a0000001-0000-0000-0000-000000000006'::uuid,
    'a0000001-0000-0000-0000-000000000007'::uuid,
    'a0000001-0000-0000-0000-000000000008'::uuid,
    'a0000001-0000-0000-0000-000000000009'::uuid,
    'a0000001-0000-0000-0000-000000000010'::uuid
  ];
  demo_orders uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO demo_orders
    FROM public.orders
    WHERE patient_id = ANY(demo_users) OR pharmacy_id = ANY(demo_users);

  DELETE FROM public.order_messages       WHERE order_id = ANY(demo_orders);
  DELETE FROM public.driver_locations     WHERE order_id = ANY(demo_orders) OR driver_id = ANY(demo_users);
  DELETE FROM public.delivery_offers      WHERE order_id = ANY(demo_orders) OR pharmacy_id = ANY(demo_users);
  DELETE FROM public.deliveries           WHERE order_id = ANY(demo_orders) OR driver_id = ANY(demo_users);
  DELETE FROM public.ratings              WHERE patient_id = ANY(demo_users) OR order_id = ANY(demo_orders);
  DELETE FROM public.payments             WHERE patient_id = ANY(demo_users) OR order_id = ANY(demo_orders);
  DELETE FROM public.prescription_audit_log
         WHERE prescription_upload_id IN (
           SELECT id FROM public.prescription_uploads
            WHERE patient_id = ANY(demo_users) OR pharmacy_id = ANY(demo_users)
         );
  DELETE FROM public.prescription_uploads WHERE patient_id = ANY(demo_users) OR pharmacy_id = ANY(demo_users);
  DELETE FROM public.prescriptions        WHERE patient_id = ANY(demo_users) OR hospital_id = ANY(demo_users);
  DELETE FROM public.pharmacy_appointments WHERE patient_id = ANY(demo_users) OR pharmacy_id = ANY(demo_users);
  DELETE FROM public.complaints           WHERE user_id = ANY(demo_users);
  DELETE FROM public.notifications        WHERE user_id = ANY(demo_users);
  DELETE FROM public.medication_reminders WHERE user_id = ANY(demo_users);
  DELETE FROM public.user_addresses       WHERE user_id = ANY(demo_users);
  DELETE FROM public.family_members       WHERE user_id = ANY(demo_users);
  DELETE FROM public.saved_payment_methods WHERE user_id = ANY(demo_users);
  DELETE FROM public.driver_payouts       WHERE driver_id = ANY(demo_users);
  DELETE FROM public.driver_bank_accounts WHERE driver_id = ANY(demo_users);
  DELETE FROM public.driver_documents     WHERE driver_id = ANY(demo_users);
  DELETE FROM public.driver_status        WHERE driver_id = ANY(demo_users);
  DELETE FROM public.orders               WHERE id = ANY(demo_orders);
  DELETE FROM public.medications          WHERE pharmacy_id = ANY(demo_users);
END $$;