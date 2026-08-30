CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  actor_name text,
  action text NOT NULL,
  subject_user uuid,
  project_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_events TO authenticated;
GRANT ALL ON public.admin_audit_events TO service_role;

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin audit read" ON public.admin_audit_events
  FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

CREATE POLICY "admin audit insert" ON public.admin_audit_events
  FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()) AND actor = auth.uid());

CREATE INDEX IF NOT EXISTS admin_audit_events_created_idx ON public.admin_audit_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.adviser_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  phone text,
  project_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  invited_by uuid,
  status text NOT NULL DEFAULT 'pending',
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS adviser_invitations_email_key ON public.adviser_invitations (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.adviser_invitations TO authenticated;
GRANT ALL ON public.adviser_invitations TO service_role;

ALTER TABLE public.adviser_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adviser invitations admin" ON public.adviser_invitations
  FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS project_advisers_adviser_idx ON public.project_advisers (adviser_id);