-- 1. New role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';

-- 2. Additive columns on the existing applications table
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS application_type text NOT NULL DEFAULT 'investor',
  ADD COLUMN IF NOT EXISTS partner_reference text,
  ADD COLUMN IF NOT EXISTS pricing_method text,
  ADD COLUMN IF NOT EXISTS standard_price numeric(16,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(7,4),
  ADD COLUMN IF NOT EXISTS negotiated_price numeric(16,2),
  ADD COLUMN IF NOT EXISTS discount_approval text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pricing_set_by uuid,
  ADD COLUMN IF NOT EXISTS pricing_set_at timestamptz;

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_application_type_chk,
  DROP CONSTRAINT IF EXISTS applications_pricing_method_chk,
  DROP CONSTRAINT IF EXISTS applications_discount_percent_chk,
  DROP CONSTRAINT IF EXISTS applications_price_range_chk,
  DROP CONSTRAINT IF EXISTS applications_discount_approval_chk;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_application_type_chk
    CHECK (application_type IN ('investor', 'partner')),
  ADD CONSTRAINT applications_pricing_method_chk
    CHECK (pricing_method IS NULL OR pricing_method IN ('discount', 'negotiated')),
  ADD CONSTRAINT applications_discount_percent_chk
    CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  ADD CONSTRAINT applications_price_range_chk
    CHECK ((standard_price IS NULL OR standard_price >= 0)
           AND (negotiated_price IS NULL OR negotiated_price >= 0)),
  ADD CONSTRAINT applications_discount_approval_chk
    CHECK (discount_approval IN ('pending', 'approved', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS applications_partner_reference_key
  ON public.applications (partner_reference) WHERE partner_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS applications_application_type_idx
  ON public.applications (application_type);

CREATE SEQUENCE IF NOT EXISTS public.partner_application_seq;
GRANT USAGE, SELECT ON SEQUENCE public.partner_application_seq TO authenticated, service_role;

-- 3. Authority check: role in the database is the only source of truth
CREATE OR REPLACE FUNCTION private.is_partner_buyer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id
       AND role::text IN ('partner', 'adviser', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION private.is_partner_buyer(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Server-side pricing guard + derivation + reference assignment
CREATE OR REPLACE FUNCTION public.enforce_partner_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_allowed boolean := private.is_partner_buyer(auth.uid());
  v_admin   boolean := private.admin_can(auth.uid(), 'applications', 'edit');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_allowed THEN
      NEW.application_type := 'investor';
      NEW.pricing_method := NULL;
      NEW.standard_price := NULL;
      NEW.discount_percent := NULL;
      NEW.negotiated_price := NULL;
      NEW.discount_approval := 'pending';
    END IF;
    NEW.partner_reference := NULL;
    NEW.pricing_set_by := NULL;
    NEW.pricing_set_at := NULL;
  ELSE
    IF NOT v_allowed THEN
      NEW.application_type := OLD.application_type;
      NEW.pricing_method := OLD.pricing_method;
      NEW.standard_price := OLD.standard_price;
      NEW.discount_percent := OLD.discount_percent;
      NEW.negotiated_price := OLD.negotiated_price;
    END IF;
    NEW.partner_reference := OLD.partner_reference;
    NEW.pricing_set_by := OLD.pricing_set_by;
    NEW.pricing_set_at := OLD.pricing_set_at;
    IF NEW.discount_approval IS DISTINCT FROM OLD.discount_approval AND NOT v_admin THEN
      NEW.discount_approval := OLD.discount_approval;
    END IF;
  END IF;

  IF NEW.application_type <> 'partner' THEN
    NEW.pricing_method := NULL;
    NEW.standard_price := NULL;
    NEW.discount_percent := NULL;
    NEW.negotiated_price := NULL;
    RETURN NEW;
  END IF;

  IF NEW.standard_price IS NOT NULL THEN
    IF coalesce(NEW.pricing_method, 'discount') = 'negotiated' AND NEW.negotiated_price IS NOT NULL THEN
      NEW.pricing_method := 'negotiated';
      IF NEW.negotiated_price > NEW.standard_price THEN
        RAISE EXCEPTION 'The negotiated price cannot be higher than the standard price';
      END IF;
      NEW.discount_percent := CASE
        WHEN NEW.standard_price > 0
          THEN round(((NEW.standard_price - NEW.negotiated_price) / NEW.standard_price) * 100, 4)
        ELSE 0 END;
    ELSE
      NEW.pricing_method := 'discount';
      NEW.discount_percent := coalesce(NEW.discount_percent, 0);
      NEW.negotiated_price := round(NEW.standard_price - (NEW.standard_price * NEW.discount_percent / 100), 2);
    END IF;
    NEW.investment := coalesce(NEW.investment, '{}'::jsonb) || jsonb_build_object(
      'unit_price', NEW.standard_price,
      'units', 1,
      'total_value', NEW.negotiated_price
    );
  END IF;

  IF NEW.partner_reference IS NULL THEN
    NEW.partner_reference := 'KVP-PARTNER-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.partner_application_seq')::text, 6, '0');
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.standard_price IS DISTINCT FROM OLD.standard_price
     OR NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
     OR NEW.negotiated_price IS DISTINCT FROM OLD.negotiated_price THEN
    NEW.pricing_set_by := auth.uid();
    NEW.pricing_set_at := now();
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS applications_partner_pricing ON public.applications;
CREATE TRIGGER applications_partner_pricing
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_pricing();

REVOKE ALL ON FUNCTION public.enforce_partner_pricing() FROM PUBLIC, anon, authenticated;

-- 5. Audit trail for negotiated pricing, using the existing audit history
CREATE OR REPLACE FUNCTION public.audit_partner_pricing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.application_type <> 'partner' AND coalesce(OLD.application_type, 'investor') <> 'partner' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.application_type IS NOT DISTINCT FROM OLD.application_type
     AND NEW.standard_price IS NOT DISTINCT FROM OLD.standard_price
     AND NEW.discount_percent IS NOT DISTINCT FROM OLD.discount_percent
     AND NEW.negotiated_price IS NOT DISTINCT FROM OLD.negotiated_price
     AND NEW.discount_approval IS NOT DISTINCT FROM OLD.discount_approval THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.admin_audit_events
    (actor, actor_name, actor_role, action, subject_user, entity_type, entity_id, project_id, detail)
  VALUES (
    auth.uid(),
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    CASE
      WHEN private.is_admin(auth.uid()) THEN 'admin'
      WHEN private.is_partner_buyer(auth.uid()) THEN 'partner'
      ELSE 'investor' END,
    CASE WHEN TG_OP = 'INSERT' THEN 'PARTNER_APPLICATION_CREATED' ELSE 'PARTNER_PRICING_CHANGED' END,
    NEW.investor_id,
    'application',
    NEW.id,
    NEW.project_id,
    jsonb_build_object(
      'partner_reference', NEW.partner_reference,
      'previous', CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'standard_price', OLD.standard_price,
        'discount_percent', OLD.discount_percent,
        'negotiated_price', OLD.negotiated_price,
        'discount_approval', OLD.discount_approval
      ) ELSE NULL END,
      'current', jsonb_build_object(
        'standard_price', NEW.standard_price,
        'discount_percent', NEW.discount_percent,
        'discount_amount', coalesce(NEW.standard_price, 0) - coalesce(NEW.negotiated_price, 0),
        'negotiated_price', NEW.negotiated_price,
        'discount_approval', NEW.discount_approval
      ),
      'changed_at', now()
    )
  );
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS applications_partner_pricing_audit ON public.applications;
CREATE TRIGGER applications_partner_pricing_audit
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_partner_pricing_change();

REVOKE ALL ON FUNCTION public.audit_partner_pricing_change() FROM PUBLIC, anon, authenticated;