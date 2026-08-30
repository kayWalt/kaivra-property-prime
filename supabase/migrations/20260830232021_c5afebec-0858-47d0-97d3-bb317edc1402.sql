CREATE OR REPLACE FUNCTION public.enforce_application_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_unit_price numeric;
  v_units integer;
  v_units_text text;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'submitted' THEN
      RAISE EXCEPTION 'Only KAIVRA staff can set this application status';
    END IF;
    NEW.investor_id := OLD.investor_id;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.review_note := OLD.review_note;
    NEW.reference := OLD.reference;
  END IF;

  IF NEW.status <> 'draft' AND NEW.property_id IS NOT NULL THEN
    SELECT unit_price INTO v_unit_price FROM public.properties WHERE id = NEW.property_id;
    IF v_unit_price IS NOT NULL THEN
      v_units_text := coalesce(NEW.investment, '{}'::jsonb) ->> 'units';
      IF v_units_text ~ '^[0-9]+$' THEN
        v_units := greatest(1, v_units_text::integer);
      ELSE
        v_units := 1;
      END IF;
      NEW.investment := coalesce(NEW.investment, '{}'::jsonb) || jsonb_build_object(
        'unit_price', v_unit_price,
        'units', v_units,
        'total_value', v_unit_price * v_units
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_integrity ON public.applications;
CREATE TRIGGER applications_integrity
BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.enforce_application_integrity();

CREATE OR REPLACE FUNCTION public.enforce_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_status application_status;
BEGIN
  IF private.is_staff(auth.uid()) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.applications
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.application_id ELSE NEW.application_id END;

  IF v_status IS NULL OR v_status NOT IN ('draft', 'requires_correction') THEN
    RAISE EXCEPTION 'Payment records can only be changed while the application is editable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.status := OLD.status;
    NEW.verified_by := OLD.verified_by;
    NEW.verified_at := OLD.verified_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_integrity ON public.application_payments;
CREATE TRIGGER payments_integrity
BEFORE INSERT OR UPDATE OR DELETE ON public.application_payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_integrity();

CREATE OR REPLACE FUNCTION public.enforce_document_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_status application_status;
BEGIN
  IF private.is_staff(auth.uid()) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.applications
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.application_id ELSE NEW.application_id END;

  IF v_status IS NULL OR v_status NOT IN ('draft', 'requires_correction') THEN
    RAISE EXCEPTION 'Documents can only be changed while the application is editable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_integrity ON public.application_documents;
CREATE TRIGGER documents_integrity
BEFORE INSERT OR DELETE ON public.application_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_document_integrity();