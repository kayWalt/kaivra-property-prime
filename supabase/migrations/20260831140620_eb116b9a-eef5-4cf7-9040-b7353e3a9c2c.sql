CREATE OR REPLACE FUNCTION public.enforce_payment_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_status application_status;
BEGIN
  IF private.is_staff(auth.uid()) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.applications
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.application_id ELSE NEW.application_id END;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Investors may submit proof of a new payment at any stage of the review.
    NEW.status := 'pending';
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;

  IF v_status NOT IN ('draft', 'requires_correction') THEN
    RAISE EXCEPTION 'Payment records can only be changed while the application is editable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  NEW.status := OLD.status;
  NEW.verified_by := OLD.verified_by;
  NEW.verified_at := OLD.verified_at;
  NEW.rejection_reason := OLD.rejection_reason;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_document_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_status application_status;
BEGIN
  IF private.is_staff(auth.uid()) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.applications
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.application_id ELSE NEW.application_id END;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- Proof-of-payment uploads are allowed at any stage; other documents only
  -- while the application is still editable.
  IF TG_OP = 'INSERT' AND NEW.kind = 'proof_of_payment' THEN
    RETURN NEW;
  END IF;

  IF v_status NOT IN ('draft', 'requires_correction') THEN
    RAISE EXCEPTION 'Documents can only be changed while the application is editable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;