
CREATE TABLE public.order_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_messages_order ON public.order_messages(order_id, created_at);

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- A user is a participant of an order if: patient, pharmacy, or assigned driver
CREATE OR REPLACE FUNCTION public.is_order_participant(_user_id uuid, _order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id
      AND (o.patient_id = _user_id OR o.pharmacy_id = _user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = _order_id AND d.driver_id = _user_id
  )
$$;

CREATE POLICY "Participants can view order messages"
  ON public.order_messages FOR SELECT
  USING (public.is_order_participant(auth.uid(), order_id));

CREATE POLICY "Participants can send order messages"
  ON public.order_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND public.is_order_participant(auth.uid(), order_id));

CREATE POLICY "Senders can mark own message read"
  ON public.order_messages FOR UPDATE
  USING (auth.uid() = sender_id);

CREATE POLICY "Admins manage all messages"
  ON public.order_messages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
ALTER TABLE public.order_messages REPLICA IDENTITY FULL;
