-- 1. ai_settings: restrict reads to authenticated users only
DROP POLICY IF EXISTS "Anyone can read AI settings" ON public.ai_settings;
REVOKE ALL ON public.ai_settings FROM anon;
CREATE POLICY "Authenticated read AI settings"
  ON public.ai_settings FOR SELECT TO authenticated USING (true);
GRANT SELECT (enabled, welcome_message, categories, escalation_enabled, whatsapp_enabled, whatsapp_number, support_phone, support_email, support_hours, updated_at)
  ON public.ai_settings TO authenticated;

-- 2. support_messages: allow ticket participants to mark messages read (read_at only)
CREATE OR REPLACE FUNCTION private.guard_support_message_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF private.is_staff(auth.uid()) IS NOT TRUE THEN
    NEW.ticket_id := OLD.ticket_id;
    NEW.author_id := OLD.author_id;
    NEW.body := OLD.body;
    NEW.is_internal := OLD.is_internal;
    NEW.attachment_path := OLD.attachment_path;
    NEW.attachment_name := OLD.attachment_name;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_support_message_update ON public.support_messages;
CREATE TRIGGER guard_support_message_update
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION private.guard_support_message_update();

GRANT UPDATE (read_at) ON public.support_messages TO authenticated;

DROP POLICY IF EXISTS "Participants mark support messages read" ON public.support_messages;
CREATE POLICY "Participants mark support messages read"
  ON public.support_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (private.is_staff(auth.uid()) OR (support_messages.is_internal = false AND t.investor_id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (private.is_staff(auth.uid()) OR (support_messages.is_internal = false AND t.investor_id = auth.uid()))
    )
  );

-- 3. support_tickets: investors may only close their own still-open tickets
CREATE OR REPLACE FUNCTION private.guard_support_ticket_investor_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF private.is_staff(auth.uid()) IS NOT TRUE THEN
    NEW.investor_id := OLD.investor_id;
    NEW.reference := OLD.reference;
    NEW.application_id := OLD.application_id;
    NEW.project_id := OLD.project_id;
    NEW.subject := OLD.subject;
    NEW.category := OLD.category;
    NEW.message := OLD.message;
    NEW.priority := OLD.priority;
    NEW.assigned_to := OLD.assigned_to;
    NEW.channel := OLD.channel;
    NEW.resolved_at := OLD.resolved_at;
    NEW.created_at := OLD.created_at;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'closed' THEN
      RAISE EXCEPTION 'Investors can only close their own open support tickets';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_support_ticket_investor_update ON public.support_tickets;
CREATE TRIGGER guard_support_ticket_investor_update
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION private.guard_support_ticket_investor_update();

DROP POLICY IF EXISTS "Investors close own support tickets" ON public.support_tickets;
CREATE POLICY "Investors close own support tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (investor_id = auth.uid() AND status NOT IN ('resolved', 'closed'))
  WITH CHECK (investor_id = auth.uid() AND status = 'closed');