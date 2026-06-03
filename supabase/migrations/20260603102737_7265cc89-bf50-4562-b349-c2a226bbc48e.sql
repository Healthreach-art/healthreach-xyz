
-- 1) Add 'doctor' to app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'doctor';
