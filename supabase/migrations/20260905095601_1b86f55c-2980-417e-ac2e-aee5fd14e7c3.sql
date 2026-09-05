
CREATE OR REPLACE FUNCTION public.pin_application_staff_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF private.is_staff(auth.uid()) OR private.is_partner_buyer(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Ordinary investors may never change pricing or assignment columns.
  NEW.application_type   := OLD.application_type;
  NEW.pricing_method     := OLD.pricing_method;
  NEW.standard_price     := OLD.standard_price;
  NEW.discount_percent   := OLD.discount_percent;
  NEW.negotiated_price   := OLD.negotiated_price;
  NEW.discount_approval  := OLD.discount_approval;
  NEW.pricing_set_by     := OLD.pricing_set_by;
  NEW.pricing_set_at     := OLD.pricing_set_at;
  NEW.partner_reference  := OLD.partner_reference;
  NEW.adviser_id         := OLD.adviser_id;
  RETURN NEW;
END; $function$;

REVOKE ALL ON FUNCTION public.pin_application_staff_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS applications_pin_staff_fields ON public.applications;
CREATE TRIGGER applications_pin_staff_fields
BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.pin_application_staff_fields();

CREATE OR REPLACE FUNCTION public.pin_inspection_staff_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF private.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  NEW.assigned_adviser := OLD.assigned_adviser;
  NEW.admin_note       := OLD.admin_note;
  NEW.investor_id      := OLD.investor_id;
  NEW.reference        := OLD.reference;
  RETURN NEW;
END; $function$;

REVOKE ALL ON FUNCTION public.pin_inspection_staff_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inspections_pin_staff_fields ON public.inspection_appointments;
CREATE TRIGGER inspections_pin_staff_fields
BEFORE UPDATE ON public.inspection_appointments
FOR EACH ROW EXECUTE FUNCTION public.pin_inspection_staff_fields();
