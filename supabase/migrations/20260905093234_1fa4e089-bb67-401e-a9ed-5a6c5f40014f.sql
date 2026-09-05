-- Normalise reference (trim; empty -> NULL) before insert/update
CREATE OR REPLACE FUNCTION public.normalize_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.reference IS NOT NULL THEN
    NEW.reference := nullif(btrim(NEW.reference), '');
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.normalize_payment_reference() FROM PUBLIC;

DROP TRIGGER IF EXISTS payments_normalize_reference ON public.application_payments;
CREATE TRIGGER payments_normalize_reference
  BEFORE INSERT OR UPDATE ON public.application_payments
  FOR EACH ROW EXECUTE FUNCTION public.normalize_payment_reference();

-- Case-insensitive global uniqueness (race-safe, applies to every role)
CREATE UNIQUE INDEX IF NOT EXISTS application_payments_reference_unique_ci
  ON public.application_payments (lower(reference))
  WHERE reference IS NOT NULL;

-- Friendly, explicit rejection ahead of the index (excludes the row itself on update)
CREATE OR REPLACE FUNCTION public.assert_unique_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.reference IS NOT NULL
     AND lower(OLD.reference) = lower(NEW.reference) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.application_payments p
     WHERE lower(p.reference) = lower(NEW.reference)
       AND p.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PAYMENT_REFERENCE'
      USING ERRCODE = '23505',
            MESSAGE = 'Payment reference already exists. This transfer reference has already been submitted and cannot be recorded again.';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.assert_unique_payment_reference() FROM PUBLIC;

DROP TRIGGER IF EXISTS payments_unique_reference ON public.application_payments;
CREATE TRIGGER payments_unique_reference
  BEFORE INSERT OR UPDATE ON public.application_payments
  FOR EACH ROW EXECUTE FUNCTION public.assert_unique_payment_reference();