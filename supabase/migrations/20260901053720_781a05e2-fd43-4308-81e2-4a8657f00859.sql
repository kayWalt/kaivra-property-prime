-- ============ support tickets ============
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE,
  investor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_investor_idx ON public.support_tickets(investor_id, created_at DESC);
CREATE INDEX support_tickets_status_idx ON public.support_tickets(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read own support tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (
  investor_id = auth.uid()
  OR private.is_admin(auth.uid())
  OR (
    private.is_staff(auth.uid())
    AND (
      assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_advisers pa
        WHERE pa.adviser_id = auth.uid() AND pa.project_id = support_tickets.project_id
      )
    )
  )
);

CREATE POLICY "Investors create own support tickets"
ON public.support_tickets FOR INSERT TO authenticated
WITH CHECK (investor_id = auth.uid() OR private.is_staff(auth.uid()));

CREATE POLICY "Staff update support tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (
  private.is_admin(auth.uid())
  OR (
    private.is_staff(auth.uid())
    AND (
      assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_advisers pa
        WHERE pa.adviser_id = auth.uid() AND pa.project_id = support_tickets.project_id
      )
    )
  )
)
WITH CHECK (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.assign_support_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reference IS NULL THEN
      NEW.reference := private.kaivra_unique_ref('KVR-SUP', 6, 'public.support_tickets', 'reference', now());
    END IF;
  ELSE
    NEW.reference := OLD.reference;
    NEW.investor_id := OLD.investor_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER support_tickets_reference BEFORE INSERT OR UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.assign_support_reference();

CREATE TRIGGER support_tickets_updated BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ support replies ============
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_idx ON public.support_messages(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read support messages on visible tickets"
ON public.support_messages FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id)
  AND (
    private.is_staff(auth.uid())
    OR (
      is_internal = false
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.investor_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Write support messages on visible tickets"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    private.is_staff(auth.uid())
    OR (
      is_internal = false
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.investor_id = auth.uid()
      )
    )
  )
);

-- ============ AI conversation history ============
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_user_idx ON public.ai_conversations(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own AI conversations" ON public.ai_conversations FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER ai_conversations_updated BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON public.ai_messages(conversation_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own AI messages" ON public.ai_messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- ============ AI settings (single row) ============
CREATE TABLE public.ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  welcome_message text NOT NULL DEFAULT 'Hi, I''m KAIVRA AI Assist. I can help you navigate KAIVRA, understand your application and answer questions using verified KAIVRA information.',
  categories jsonb NOT NULL DEFAULT '["Application help","Payment","Inspection","Project information","Documents","Account/login","Complaint","Other"]'::jsonb,
  escalation_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_settings TO authenticated, anon;
GRANT INSERT, UPDATE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read AI settings" ON public.ai_settings FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Admins change AI settings" ON public.ai_settings FOR UPDATE TO authenticated
USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "Admins seed AI settings" ON public.ai_settings FOR INSERT TO authenticated
WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER ai_settings_updated BEFORE UPDATE ON public.ai_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ai_settings (id) VALUES (true);