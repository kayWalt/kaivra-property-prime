CREATE OR REPLACE FUNCTION public.enforce_application_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_unit_price numeric;
  v_units integer;
  v_units_text text;
  v_is_admin boolean := private.is_admin(auth.uid());
  v_is_staff boolean := private.is_staff(auth.uid());
BEGIN
  IF NOT v_is_staff THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'submitted' THEN
      RAISE EXCEPTION 'Only KAIVRA staff can set this application status';
    END IF;
    NEW.investor_id := OLD.investor_id;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.review_note := OLD.review_note;
    NEW.reference := OLD.reference;
  ELSIF NOT v_is_admin THEN
    -- Advisers may progress a review but never approve, reject, or re-own it.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Only KAIVRA administrators can approve or reject an application';
    END IF;
    NEW.investor_id := OLD.investor_id;
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
$function$;