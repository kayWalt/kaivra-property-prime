CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.kaivra_random(p_len int)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = private, extensions, public AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text := '';
  i int;
BEGIN
  bytes := extensions.gen_random_bytes(p_len);
  FOR i IN 0..p_len - 1 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  END LOOP;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION private.kaivra_unique_ref(p_prefix text, p_len int, p_table text, p_col text, p_when timestamptz DEFAULT now())
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = private, extensions, public AS $$
DECLARE
  candidate text;
  taken boolean;
  yy text := to_char(coalesce(p_when, now()), 'YY');
BEGIN
  LOOP
    candidate := p_prefix || '-' || yy || '-' || private.kaivra_random(p_len);
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I = $1)', p_table, p_col) INTO taken USING candidate;
    EXIT WHEN NOT taken;
  END LOOP;
  RETURN candidate;
END; $$;

-- ---------- new columns ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS legacy_investor_code text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS legacy_reference text;
ALTER TABLE public.inspection_appointments ADD COLUMN IF NOT EXISTS legacy_reference text;
ALTER TABLE public.application_payments ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS property_code text;

-- ---------- backfill ----------
UPDATE public.profiles SET legacy_investor_code = investor_code WHERE investor_code IS NOT NULL AND legacy_investor_code IS NULL;
UPDATE public.applications SET legacy_reference = reference WHERE reference IS NOT NULL AND legacy_reference IS NULL;
UPDATE public.inspection_appointments SET legacy_reference = reference WHERE reference IS NOT NULL AND legacy_reference IS NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, created_at FROM public.profiles LOOP
    UPDATE public.profiles SET investor_code = private.kaivra_unique_ref('KVR-I', 6, 'public.profiles', 'investor_code', r.created_at) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, coalesce(submitted_at, created_at) AS created_at FROM public.applications WHERE reference IS NOT NULL LOOP
    UPDATE public.applications SET reference = private.kaivra_unique_ref('KVR-A', 8, 'public.applications', 'reference', r.created_at) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM public.inspection_appointments LOOP
    UPDATE public.inspection_appointments SET reference = private.kaivra_unique_ref('KVR-S', 8, 'public.inspection_appointments', 'reference', r.created_at) WHERE id = r.id;
  END LOOP;
  ALTER TABLE public.application_payments DISABLE TRIGGER payments_integrity;
  FOR r IN SELECT id, created_at FROM public.application_payments LOOP
    UPDATE public.application_payments SET payment_reference = private.kaivra_unique_ref('KVR-P', 8, 'public.application_payments', 'payment_reference', r.created_at) WHERE id = r.id;
  END LOOP;
  ALTER TABLE public.application_payments ENABLE TRIGGER payments_integrity;
  FOR r IN SELECT id, created_at FROM public.projects LOOP
    UPDATE public.projects SET project_code = private.kaivra_unique_ref('KVR-PR', 4, 'public.projects', 'project_code', r.created_at) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM public.properties LOOP
    UPDATE public.properties SET property_code = private.kaivra_unique_ref('KVR-PRP', 6, 'public.properties', 'property_code', r.created_at) WHERE id = r.id;
  END LOOP;
END $$;

-- ---------- constraints & indexes ----------
CREATE UNIQUE INDEX IF NOT EXISTS profiles_investor_code_key ON public.profiles (investor_code);
CREATE UNIQUE INDEX IF NOT EXISTS applications_reference_key ON public.applications (reference);
CREATE UNIQUE INDEX IF NOT EXISTS inspection_appointments_reference_key ON public.inspection_appointments (reference);
CREATE UNIQUE INDEX IF NOT EXISTS application_payments_payment_reference_key ON public.application_payments (payment_reference);
CREATE UNIQUE INDEX IF NOT EXISTS projects_project_code_key ON public.projects (project_code);
CREATE UNIQUE INDEX IF NOT EXISTS properties_property_code_key ON public.properties (property_code);

ALTER TABLE public.inspection_appointments ALTER COLUMN reference SET NOT NULL;
ALTER TABLE public.application_payments ALTER COLUMN payment_reference SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN project_code SET NOT NULL;
ALTER TABLE public.properties ALTER COLUMN property_code SET NOT NULL;

-- ---------- trigger functions ----------
CREATE OR REPLACE FUNCTION public.assign_investor_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.investor_code IS NULL THEN
      NEW.investor_code := private.kaivra_unique_ref('KVR-I', 6, 'public.profiles', 'investor_code', now());
    END IF;
  ELSE
    NEW.investor_code := OLD.investor_code;
    NEW.legacy_investor_code := OLD.legacy_investor_code;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_application_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.status <> 'draft' AND NEW.reference IS NULL THEN
    NEW.reference := private.kaivra_unique_ref('KVR-A', 8, 'public.applications', 'reference', now());
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.reference IS NOT NULL THEN
    NEW.reference := OLD.reference;
  END IF;
  IF NEW.status <> 'draft' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_inspection_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := private.kaivra_unique_ref('KVR-S', 8, 'public.inspection_appointments', 'reference', now());
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_payment_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.payment_reference := private.kaivra_unique_ref('KVR-P', 8, 'public.application_payments', 'payment_reference', now());
  ELSE
    NEW.payment_reference := OLD.payment_reference;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_project_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.project_code IS NULL THEN
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
    IF NEW.property_code IS NULL THEN
      NEW.property_code := private.kaivra_unique_ref('KVR-PRP', 6, 'public.properties', 'property_code', now());
    END IF;
  ELSE
    NEW.property_code := OLD.property_code;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS payments_reference ON public.application_payments;
CREATE TRIGGER payments_reference BEFORE INSERT OR UPDATE ON public.application_payments
  FOR EACH ROW EXECUTE FUNCTION public.assign_payment_reference();

DROP TRIGGER IF EXISTS projects_code ON public.projects;
CREATE TRIGGER projects_code BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.assign_project_code();

DROP TRIGGER IF EXISTS properties_code ON public.properties;
CREATE TRIGGER properties_code BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.assign_property_code();

DROP SEQUENCE IF EXISTS public.investor_code_seq;
DROP SEQUENCE IF EXISTS public.application_reference_seq;
DROP SEQUENCE IF EXISTS public.inspection_reference_seq;