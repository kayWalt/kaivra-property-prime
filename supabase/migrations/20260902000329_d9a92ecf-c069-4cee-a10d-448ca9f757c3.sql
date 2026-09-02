ALTER TABLE public.application_payments ALTER COLUMN payment_reference SET DEFAULT '';
ALTER TABLE public.inspection_appointments ALTER COLUMN reference SET DEFAULT '';
ALTER TABLE public.projects ALTER COLUMN project_code SET DEFAULT '';
ALTER TABLE public.properties ALTER COLUMN property_code SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.assign_inspection_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := private.kaivra_unique_ref('KVR-S', 8, 'public.inspection_appointments', 'reference', now());
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_project_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.project_code IS NULL OR NEW.project_code = '' THEN
      NEW.project_code := private.kaivra_unique_ref('KVR-PR', 4, 'public.projects', 'project_code', now());
    END IF;
  ELSE
    NEW.project_code := OLD.project_code;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_property_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.property_code IS NULL OR NEW.property_code = '' THEN
      NEW.property_code := private.kaivra_unique_ref('KVR-PRP', 6, 'public.properties', 'property_code', now());
    END IF;
  ELSE
    NEW.property_code := OLD.property_code;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.assign_inspection_reference() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_project_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_property_code() FROM PUBLIC, anon, authenticated;