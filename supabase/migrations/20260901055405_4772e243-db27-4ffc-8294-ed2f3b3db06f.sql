ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app';

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '2347058926912',
  ADD COLUMN IF NOT EXISTS support_phone text NOT NULL DEFAULT '+2349125067938',
  ADD COLUMN IF NOT EXISTS support_email text NOT NULL DEFAULT 'support@kaivra.com',
  ADD COLUMN IF NOT EXISTS support_hours text NOT NULL DEFAULT 'Monday to Saturday, 9:00am – 6:00pm (WAT)';

CREATE OR REPLACE FUNCTION public.touch_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET last_message_at = now(),
         updated_at = now()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS support_messages_touch_ticket ON public.support_messages;
CREATE TRIGGER support_messages_touch_ticket
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket();

DROP POLICY IF EXISTS "Investors close own support tickets" ON public.support_tickets;
CREATE POLICY "Investors close own support tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (investor_id = auth.uid())
WITH CHECK (investor_id = auth.uid());

ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;