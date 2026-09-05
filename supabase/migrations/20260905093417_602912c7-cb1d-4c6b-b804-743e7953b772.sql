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
    RAISE EXCEPTION 'Payment reference already exists. This transfer reference has already been submitted and cannot be recorded again.'
      USING ERRCODE = '23505', DETAIL = 'DUPLICATE_PAYMENT_REFERENCE';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.assert_unique_payment_reference() FROM PUBLIC, anon, authenticated;