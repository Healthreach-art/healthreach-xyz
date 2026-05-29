-- Add is_demo flags so the demo ticker only touches mock rows
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_is_demo_status ON public.orders(is_demo, status) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_delivery_offers_is_demo_status ON public.delivery_offers(is_demo, status) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_deliveries_is_demo_status ON public.deliveries(is_demo, status) WHERE is_demo = true;