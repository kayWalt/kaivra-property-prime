ALTER TABLE public.application_payments ALTER COLUMN payment_reference DROP DEFAULT;
ALTER TABLE public.inspection_appointments ALTER COLUMN reference DROP DEFAULT;
ALTER TABLE public.projects ALTER COLUMN project_code DROP DEFAULT;
ALTER TABLE public.properties ALTER COLUMN property_code DROP DEFAULT;
DROP TRIGGER IF EXISTS inspections_reference ON public.inspection_appointments;
CREATE TRIGGER inspections_reference BEFORE INSERT ON public.inspection_appointments
  FOR EACH ROW EXECUTE FUNCTION public.assign_inspection_reference();