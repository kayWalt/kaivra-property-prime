CREATE SEQUENCE IF NOT EXISTS public.investor_code_seq;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS investor_code text;

-- Backfill existing profiles in registration order, oldest first.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.profiles
  WHERE investor_code IS NULL
)
UPDATE public.profiles p
   SET investor_code = 'KVR-INV-' || lpad(o.rn::text, 6, '0')
  FROM ordered o
 WHERE p.id = o.id;

SELECT setval('public.investor_code_seq', GREATEST((SELECT count(*) FROM public.profiles), 1), true);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_investor_code_key ON public.profiles (investor_code);

CREATE OR REPLACE FUNCTION public.assign_investor_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.investor_code IS NULL THEN
      NEW.investor_code := 'KVR-INV-' || lpad(nextval('public.investor_code_seq')::text, 6, '0');
    END IF;
  ELSE
    -- The investor ID is permanent: never editable, never reusable.
    NEW.investor_code := OLD.investor_code;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_investor_code ON public.profiles;
CREATE TRIGGER profiles_investor_code
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_investor_code();