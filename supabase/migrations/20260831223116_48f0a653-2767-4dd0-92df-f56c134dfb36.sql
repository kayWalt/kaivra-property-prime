ALTER TABLE public.inspection_appointments
  ALTER COLUMN reference SET DEFAULT private.kaivra_unique_ref('KVR-S', 8, 'public.inspection_appointments', 'reference');
ALTER TABLE public.application_payments
  ALTER COLUMN payment_reference SET DEFAULT private.kaivra_unique_ref('KVR-P', 8, 'public.application_payments', 'payment_reference');
ALTER TABLE public.projects
  ALTER COLUMN project_code SET DEFAULT private.kaivra_unique_ref('KVR-PR', 4, 'public.projects', 'project_code');
ALTER TABLE public.properties
  ALTER COLUMN property_code SET DEFAULT private.kaivra_unique_ref('KVR-PRP', 6, 'public.properties', 'property_code');

REVOKE ALL ON FUNCTION private.kaivra_random(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.kaivra_unique_ref(text, int, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_investor_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_application_reference() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_inspection_reference() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_payment_reference() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_project_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_property_code() FROM PUBLIC, anon, authenticated;