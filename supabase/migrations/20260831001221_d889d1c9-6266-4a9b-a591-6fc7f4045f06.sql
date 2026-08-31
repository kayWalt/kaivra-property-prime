CREATE INDEX IF NOT EXISTS idx_applications_investor_created ON public.applications (investor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_project_status ON public.applications (project_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_status_submitted ON public.applications (status, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_reference ON public.applications (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_property ON public.applications (property_id);

CREATE INDEX IF NOT EXISTS idx_payments_application ON public.application_payments (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.application_payments (status);

CREATE INDEX IF NOT EXISTS idx_documents_application_kind ON public.application_documents (application_id, kind);
CREATE INDEX IF NOT EXISTS idx_documents_payment ON public.application_documents (payment_id) WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_application_created ON public.application_events (application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_advisers_adviser ON public.project_advisers (adviser_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_projects_active ON public.projects (is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_properties_project_active ON public.properties (project_id, is_active);