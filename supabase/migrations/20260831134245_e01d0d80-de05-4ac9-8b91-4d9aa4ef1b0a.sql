CREATE TYPE public.inspection_status AS ENUM ('requested','confirmed','rescheduled','completed','cancelled','no_show');

CREATE SEQUENCE IF NOT EXISTS public.inspection_reference_seq;

CREATE TABLE public.inspection_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text,
  investor_id uuid NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  attendee_count integer NOT NULL DEFAULT 1,
  phone text,
  email text,
  notes text,
  status public.inspection_status NOT NULL DEFAULT 'requested',
  created_by uuid,
  assigned_adviser uuid,
  admin_note text,
  reminder_day_sent_at timestamptz,
  reminder_hour_sent_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_appointments TO authenticated;
GRANT ALL ON public.inspection_appointments TO service_role;

ALTER TABLE public.inspection_appointments ENABLE ROW LEVEL SECURITY;

CREATE INDEX inspections_investor_idx ON public.inspection_appointments (investor_id);
CREATE INDEX inspections_application_idx ON public.inspection_appointments (application_id);
CREATE INDEX inspections_project_idx ON public.inspection_appointments (project_id);
CREATE INDEX inspections_date_idx ON public.inspection_appointments (scheduled_date);
CREATE INDEX inspections_status_idx ON public.inspection_appointments (status);
CREATE INDEX inspections_adviser_idx ON public.inspection_appointments (assigned_adviser);

CREATE UNIQUE INDEX inspections_no_double_booking
  ON public.inspection_appointments (project_id, scheduled_date, scheduled_time)
  WHERE status IN ('requested','confirmed','rescheduled');

CREATE OR REPLACE FUNCTION public.assign_inspection_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := 'KVR-INSP-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.inspection_reference_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER inspections_reference
BEFORE INSERT ON public.inspection_appointments
FOR EACH ROW EXECUTE FUNCTION public.assign_inspection_reference();

CREATE TRIGGER inspections_updated
BEFORE UPDATE ON public.inspection_appointments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION private.can_view_inspection(_project_id uuid, _investor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','private'
AS $$
  SELECT _investor_id = auth.uid()
      OR private.is_admin(auth.uid())
      OR (
        private.has_role(auth.uid(), 'adviser')
        AND EXISTS (
          SELECT 1 FROM public.project_advisers pa
          WHERE pa.project_id = _project_id AND pa.adviser_id = auth.uid()
        )
      );
$$;

CREATE POLICY "inspections read" ON public.inspection_appointments
FOR SELECT TO authenticated
USING (private.can_view_inspection(project_id, investor_id));

CREATE POLICY "inspections investor insert" ON public.inspection_appointments
FOR INSERT TO authenticated
WITH CHECK (
  (investor_id = auth.uid()
   AND created_by = auth.uid()
   AND (application_id IS NULL OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = application_id AND a.investor_id = auth.uid())))
  OR private.is_staff(auth.uid())
);

CREATE POLICY "inspections investor update" ON public.inspection_appointments
FOR UPDATE TO authenticated
USING (investor_id = auth.uid() AND status IN ('requested','confirmed','rescheduled'))
WITH CHECK (investor_id = auth.uid());

CREATE POLICY "inspections staff update" ON public.inspection_appointments
FOR UPDATE TO authenticated
USING (private.is_admin(auth.uid()) OR private.can_view_inspection(project_id, investor_id))
WITH CHECK (true);

CREATE POLICY "inspections admin delete" ON public.inspection_appointments
FOR DELETE TO authenticated
USING (private.is_admin(auth.uid()));
