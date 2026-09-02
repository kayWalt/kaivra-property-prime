ALTER TABLE public.contact_enquiries
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS admin_notes text;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, created_at FROM public.contact_enquiries WHERE reference IS NULL LOOP
    UPDATE public.contact_enquiries
      SET reference = private.kaivra_unique_ref('KVR-E', 6, 'public.contact_enquiries', 'reference', r.created_at)
      WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contact_enquiries_reference_key ON public.contact_enquiries (reference);

UPDATE public.contact_enquiries SET status = 'closed' WHERE handled AND status = 'new';

ALTER TABLE public.contact_enquiries
  DROP CONSTRAINT IF EXISTS contact_enquiries_status_check;
ALTER TABLE public.contact_enquiries
  ADD CONSTRAINT contact_enquiries_status_check
  CHECK (status IN ('new','in_progress','replied','closed'));

ALTER TABLE public.contact_enquiries
  DROP CONSTRAINT IF EXISTS contact_enquiries_input_check;
ALTER TABLE public.contact_enquiries
  ADD CONSTRAINT contact_enquiries_input_check CHECK (
    length(btrim(full_name)) BETWEEN 2 AND 120
    AND length(btrim(email)) BETWEEN 5 AND 200
    AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$'
    AND (phone IS NULL OR length(btrim(phone)) <= 40)
    AND length(btrim(subject)) BETWEEN 2 AND 160
    AND length(btrim(message)) BETWEEN 10 AND 2000
    AND length(coalesce(source_page,'')) <= 300
  );

CREATE OR REPLACE FUNCTION public.assign_contact_enquiry_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reference := private.kaivra_unique_ref('KVR-E', 6, 'public.contact_enquiries', 'reference', now());
    NEW.status := 'new';
    NEW.admin_notes := NULL;
    NEW.handled := false;
    NEW.handled_by := NULL;
    NEW.handled_at := NULL;
  ELSE
    NEW.reference := OLD.reference;
    NEW.full_name := OLD.full_name;
    NEW.email := OLD.email;
    NEW.phone := OLD.phone;
    NEW.subject := OLD.subject;
    NEW.message := OLD.message;
    NEW.created_at := OLD.created_at;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.handled := NEW.status IN ('replied','closed');
      NEW.handled_by := CASE WHEN NEW.handled THEN auth.uid() ELSE NULL END;
      NEW.handled_at := CASE WHEN NEW.handled THEN now() ELSE NULL END;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS contact_enquiries_reference ON public.contact_enquiries;
CREATE TRIGGER contact_enquiries_reference
  BEFORE INSERT OR UPDATE ON public.contact_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.assign_contact_enquiry_reference();

ALTER TABLE public.contact_enquiries ALTER COLUMN reference SET NOT NULL;