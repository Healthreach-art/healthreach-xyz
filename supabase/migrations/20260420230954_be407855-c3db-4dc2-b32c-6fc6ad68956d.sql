
-- Uber-style delivery offers: pharmacies broadcast a delivery, drivers race to accept
CREATE TYPE public.offer_status AS ENUM ('open', 'accepted', 'declined', 'cancelled', 'expired');

CREATE TABLE public.delivery_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  pharmacy_id UUID NOT NULL,
  status public.offer_status NOT NULL DEFAULT 'open',
  accepted_by UUID,
  declined_by UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX idx_delivery_offers_status ON public.delivery_offers(status);
CREATE INDEX idx_delivery_offers_order ON public.delivery_offers(order_id);

ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;

-- Pharmacies manage their own offers
CREATE POLICY "Pharmacies can create offers"
  ON public.delivery_offers FOR INSERT
  WITH CHECK (auth.uid() = pharmacy_id);

CREATE POLICY "Pharmacies can view their offers"
  ON public.delivery_offers FOR SELECT
  USING (auth.uid() = pharmacy_id);

CREATE POLICY "Pharmacies can update their offers"
  ON public.delivery_offers FOR UPDATE
  USING (auth.uid() = pharmacy_id);

-- Approved drivers can view all open offers, and update them (to accept/decline)
CREATE POLICY "Drivers can view open offers"
  ON public.delivery_offers FOR SELECT
  USING (public.has_role(auth.uid(), 'driver'));

CREATE POLICY "Drivers can update open offers"
  ON public.delivery_offers FOR UPDATE
  USING (public.has_role(auth.uid(), 'driver'));

-- Admins
CREATE POLICY "Admins manage all offers"
  ON public.delivery_offers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON public.delivery_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
ALTER TABLE public.delivery_offers REPLICA IDENTITY FULL;
