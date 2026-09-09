CREATE OR REPLACE FUNCTION public.pin_application_staff_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_staff   boolean := private.is_staff(auth.uid());
  v_partner boolean := private.is_partner_buyer(auth.uid());
  v_admin   boolean := private.admin_can(auth.uid(), 'applications', 'edit');
BEGIN
  IF v_staff THEN
    RETURN NEW;
  END IF;

  -- Authorised partner buyers may still negotiate their own pricing, but never
  -- the approval decision, the pricing actor stamps or adviser assignment.
  IF v_partner AND NEW.investor_id = auth.uid() THEN
    IF NOT v_admin THEN
      NEW.discount_approval := OLD.discount_approval;
    END IF;
    NEW.pricing_set_by := OLD.pricing_set_by;
    NEW.pricing_set_at := OLD.pricing_set_at;
    NEW.partner_reference := OLD.partner_reference;
    NEW.adviser_id := OLD.adviser_id;
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

-- Ensure the guard runs after every other BEFORE UPDATE trigger on the table
-- (trigger execution order is alphabetical by name).
DROP TRIGGER IF EXISTS applications_pin_staff_fields ON public.applications;
CREATE TRIGGER zz_applications_pin_staff_fields
BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.pin_application_staff_fields();