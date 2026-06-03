
-- Generic appointment chat: doctor or pharmacy appointments
CREATE TABLE public.appointment_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  appointment_type text NOT NULL CHECK (appointment_type IN ('doctor','pharmacy')),
  patient_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('patient','doctor','pharmacy')),
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_appt_msgs_thread ON public.appointment_messages (appointment_type, appointment_id, created_at);
CREATE INDEX idx_appt_msgs_provider ON public.appointment_messages (provider_id, created_at DESC);
CREATE INDEX idx_appt_msgs_patient ON public.appointment_messages (patient_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.appointment_messages TO authenticated;
GRANT ALL ON public.appointment_messages TO service_role;

ALTER TABLE public.appointment_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view appointment messages"
  ON public.appointment_messages FOR SELECT TO authenticated
  USING (auth.uid() = patient_id OR auth.uid() = provider_id OR app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Participants send appointment messages"
  ON public.appointment_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (auth.uid() = patient_id OR auth.uid() = provider_id)
  );

CREATE POLICY "Senders mark own message read"
  ON public.appointment_messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = patient_id OR auth.uid() = provider_id);

CREATE POLICY "Admins manage appointment messages"
  ON public.appointment_messages FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_messages;

-- Notify the recipient on a new message
CREATE OR REPLACE FUNCTION public.notify_appointment_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient uuid; link text;
BEGIN
  recipient := CASE WHEN NEW.sender_id = NEW.patient_id THEN NEW.provider_id ELSE NEW.patient_id END;
  link := CASE
    WHEN NEW.sender_id = NEW.patient_id AND NEW.appointment_type = 'doctor' THEN '/dashboard/doctor'
    WHEN NEW.sender_id = NEW.patient_id AND NEW.appointment_type = 'pharmacy' THEN '/dashboard/pharmacy'
    ELSE '/dashboard/patient/consultations'
  END;
  INSERT INTO public.notifications (user_id, category, title, body, link)
  VALUES (recipient, 'message', 'New message',
          substr(NEW.body, 1, 120),
          link);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_appointment_message
  AFTER INSERT ON public.appointment_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_appointment_message();
