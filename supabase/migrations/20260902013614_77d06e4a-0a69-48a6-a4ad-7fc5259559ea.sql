-- 1) ai_settings: column-scope public reads to the whitelisted support-contact fields
REVOKE SELECT ON public.ai_settings FROM anon, authenticated;
GRANT SELECT (escalation_enabled, whatsapp_enabled, whatsapp_number, support_phone, support_email, support_hours) ON public.ai_settings TO anon, authenticated;
GRANT ALL ON public.ai_settings TO service_role;

-- 2) applications: scope staff updates with WITH CHECK and guard immutable fields
DROP POLICY IF EXISTS "applications staff update" ON public.applications;
CREATE POLICY "applications staff update"
ON public.applications
FOR UPDATE
TO authenticated
USING (private.is_admin(auth.uid()) OR (private.has_role(auth.uid(), 'adviser'::public.app_role) AND private.can_view_application(id)))
WITH CHECK (private.is_admin(auth.uid()) OR (private.has_role(auth.uid(), 'adviser'::public.app_role) AND private.can_view_application(id)));

CREATE OR REPLACE FUNCTION private.guard_application_staff_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
    IF NEW.investor_id IS DISTINCT FROM OLD.investor_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'Staff cannot reassign an application''s investor, creator, or project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_application_staff_update() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS guard_application_staff_update ON public.applications;
CREATE TRIGGER guard_application_staff_update
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION private.guard_application_staff_update();

-- 3) support_messages: immutable records, strict insert validation
DROP POLICY IF EXISTS "Write support messages on visible tickets" ON public.support_messages;
CREATE POLICY "Write support messages on visible tickets"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND read_at IS NULL
  AND attachment_path IS NULL
  AND (
    private.is_staff(auth.uid())
    OR (
      is_internal = false
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = support_messages.ticket_id
          AND t.investor_id = auth.uid()
      )
    )
  )
);
REVOKE UPDATE, DELETE ON public.support_messages FROM anon, authenticated;