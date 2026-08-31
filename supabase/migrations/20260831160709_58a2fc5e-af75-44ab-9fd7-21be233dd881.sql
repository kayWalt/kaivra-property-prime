-- Exact or prefix-duplicate indexes: each dropped index is fully covered by a
-- remaining index on the same leading columns.
DROP INDEX IF EXISTS public.idx_application_events_application;   -- == idx_events_application_created
DROP INDEX IF EXISTS public.idx_application_payments_application; -- prefix of idx_payments_application
DROP INDEX IF EXISTS public.idx_application_documents_application;-- prefix of idx_documents_application_kind
DROP INDEX IF EXISTS public.idx_applications_reference;           -- covered by unique applications_reference_key
DROP INDEX IF EXISTS public.idx_applications_investor;            -- prefix of idx_applications_investor_created
DROP INDEX IF EXISTS public.idx_applications_project;             -- prefix of idx_applications_project_status
DROP INDEX IF EXISTS public.inspections_investor_idx;             -- == idx_inspections_investor
DROP INDEX IF EXISTS public.inspections_project_idx;              -- == idx_inspections_project
DROP INDEX IF EXISTS public.project_advisers_adviser_idx;         -- == idx_project_advisers_adviser
DROP INDEX IF EXISTS public.idx_user_roles_user_role;             -- == unique user_roles_user_id_role_key
DROP INDEX IF EXISTS public.idx_user_roles_user;                  -- prefix of unique user_roles_user_id_role_key
DROP INDEX IF EXISTS public.idx_properties_project;               -- prefix of idx_properties_project_active
DROP INDEX IF EXISTS public.idx_projects_active;                  -- prefix of idx_projects_active_created