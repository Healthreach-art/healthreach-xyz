-- Collect demo user ids
WITH demo_ids AS (
  SELECT user_id AS id FROM public.profiles WHERE is_demo = true
  UNION
  SELECT id FROM auth.users
   WHERE email IN (
     'patient.demo@healthreach.co.za',
     'admin.demo@healthreach.co.za',
     'demo-alphapharm-melville@healthreach.co.za',
     'demo-clicks-sandton@healthreach.co.za',
     'demo-dischem-rosebank@healthreach.co.za',
     'demo-medirite-braamfontein@healthreach.co.za',
     'demo-driver-naledi@healthreach.co.za',
     'demo-driver-thabo@healthreach.co.za'
   )
)
DELETE FROM auth.users WHERE id IN (SELECT id FROM demo_ids);

-- Belt & braces: clear any orphan demo data
DELETE FROM public.medications WHERE pharmacy_id NOT IN (SELECT user_id FROM public.profiles);
DELETE FROM public.doctors WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT user_id FROM public.profiles);