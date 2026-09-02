-- Sequences for human-readable, non-guessable-free reference numbers
CREATE SEQUENCE IF NOT EXISTS public.correction_request_seq;
CREATE SEQUENCE IF NOT EXISTS public.complaint_seq;

-- ---------------------------------------------------------------- corrections
CREATE TABLE public.correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE,
  investor_id uuid NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  section text NOT NULL,
  field_label text NOT NULL,
  current_value text,
  requested_value text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  investor_response text,
  admin_note text,
  admin_response text,
  resolution_details text,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  applied_by uuid,
  applied_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX correction_requests_investor_idx ON public.correction_requests (investor_id, created_at DESC);
CREATE INDEX correction_requests_status_idx ON public.correction_requests (status, created_at DESC);
CREATE INDEX correction_requests_application_idx ON public.correction_requests (application_id);

GRANT SELECT, INSERT, UPDATE ON public.correction_requests TO authenticated;
GRANT ALL ON public.correction_requests TO service_role;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Correction requests readable by owner and staff"
  ON public.correction_requests FOR SELECT TO authenticated
  USING (investor_id = auth.uid() OR private.is_staff(auth.uid()));

CREATE POLICY "Investors create own correction requests"
  ON public.correction_requests FOR INSERT TO authenticated
  WITH CHECK (investor_id = auth.uid() OR private.is_staff(auth.uid()));

CREATE POLICY "Owner responds, admins manage correction requests"
  ON public.correction_requests FOR UPDATE TO authenticated
  USING (investor_id = auth.uid() OR private.is_admin(auth.uid()))
  WITH CHECK (investor_id = auth.uid() OR private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.assign_correction_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    NEW.investor_id := auth.uid();
  END IF;
  NEW.reference := 'KAI-CR-' || to_char(now(), 'YYYY') || '-' ||
                   lpad(nextval('public.correction_request_seq')::text, 6, '0');
  NEW.status := 'submitted';
  NEW.admin_note := NULL;
  NEW.admin_response := NULL;
  NEW.resolution_details := NULL;
  NEW.acknowledged_by := NULL; NEW.acknowledged_at := NULL;
  NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
  NEW.applied_by := NULL; NEW.applied_at := NULL;
  NEW.resolved_by := NULL; NEW.resolved_at := NULL;
  RETURN NEW;
END; $$;

CREATE TRIGGER correction_requests_reference
BEFORE INSERT ON public.correction_requests
FOR EACH ROW EXECUTE FUNCTION public.assign_correction_reference();

CREATE OR REPLACE FUNCTION public.guard_correction_request_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
BEGIN
  -- Immutable identity fields for everyone.
  NEW.id := OLD.id;
  NEW.reference := OLD.reference;
  NEW.investor_id := OLD.investor_id;
  NEW.application_id := OLD.application_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  IF NOT private.is_admin(auth.uid()) THEN
    -- Investors may only supply the extra information KAIVRA asked for.
    IF OLD.status <> 'additional_info' THEN
      RAISE EXCEPTION 'This correction request can no longer be edited';
    END IF;
    NEW.section := OLD.section;
    NEW.field_label := OLD.field_label;
    NEW.current_value := OLD.current_value;
    NEW.requested_value := OLD.requested_value;
    NEW.reason := OLD.reason;
    NEW.status := 'under_review';
    NEW.admin_note := OLD.admin_note;
    NEW.admin_response := OLD.admin_response;
    NEW.resolution_details := OLD.resolution_details;
    NEW.acknowledged_by := OLD.acknowledged_by;
    NEW.acknowledged_at := OLD.acknowledged_at;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.applied_by := OLD.applied_by;
    NEW.applied_at := OLD.applied_at;
    NEW.resolved_by := OLD.resolved_by;
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER correction_requests_guard
BEFORE UPDATE ON public.correction_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_correction_request_update();

-- --------------------------------------------------- correction attachments
CREATE TABLE public.correction_request_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_request_id uuid NOT NULL REFERENCES public.correction_requests(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX correction_request_documents_parent_idx
  ON public.correction_request_documents (correction_request_id);

GRANT SELECT, INSERT ON public.correction_request_documents TO authenticated;
GRANT ALL ON public.correction_request_documents TO service_role;
ALTER TABLE public.correction_request_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Correction documents follow their request"
  ON public.correction_request_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.correction_requests cr
     WHERE cr.id = correction_request_id
       AND (cr.investor_id = auth.uid() OR private.is_staff(auth.uid()))
  ));

CREATE POLICY "Owners attach documents to their request"
  ON public.correction_request_documents FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.correction_requests cr
       WHERE cr.id = correction_request_id
         AND (cr.investor_id = auth.uid() OR private.is_staff(auth.uid()))
    )
  );

-- ------------------------------------------------------------ complaints
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text;

CREATE OR REPLACE FUNCTION public.assign_support_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reference IS NULL THEN
      IF NEW.channel = 'complaint' THEN
        NEW.reference := 'KAI-CM-' || to_char(now(), 'YYYY') || '-' ||
                         lpad(nextval('public.complaint_seq')::text, 6, '0');
      ELSE
        NEW.reference := private.kaivra_unique_ref('KVR-SUP', 6, 'public.support_tickets', 'reference', now());
      END IF;
    END IF;
  ELSE
    NEW.reference := OLD.reference;
    NEW.investor_id := OLD.investor_id;
  END IF;
  RETURN NEW;
END; $$;

-- ------------------------------------------------------ audit trail fields
ALTER TABLE public.admin_audit_events
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS admin_audit_events_entity_idx
  ON public.admin_audit_events (entity_type, entity_id, created_at DESC);