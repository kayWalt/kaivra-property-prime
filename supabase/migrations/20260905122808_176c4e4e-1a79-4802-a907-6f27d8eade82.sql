-- 1. Installment schedule -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  label text NOT NULL DEFAULT 'Installment',
  amount_due numeric NOT NULL CHECK (amount_due >= 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_installments TO authenticated;
GRANT ALL ON public.application_installments TO service_role;
ALTER TABLE public.application_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read their own installments"
ON public.application_installments FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.applications a
     WHERE a.id = application_id AND a.investor_id = auth.uid()
  )
);

CREATE POLICY "Staff manage installments"
ON public.application_installments FOR ALL TO authenticated
USING (private.is_staff(auth.uid()))
WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER application_installments_updated
BEFORE UPDATE ON public.application_installments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS application_installments_seq_unique
  ON public.application_installments (application_id, sequence);

-- 2. Price change events (server-only, fail-closed) ------------------------
CREATE TABLE IF NOT EXISTS public.property_price_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  previous_price numeric,
  new_price numeric NOT NULL,
  actor uuid,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.property_price_events TO service_role;
ALTER TABLE public.property_price_events ENABLE ROW LEVEL SECURITY;

-- 3. Promotions ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  cta_label text,
  cta_url text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  audience text NOT NULL DEFAULT 'opted_in_investors',
  status text NOT NULL DEFAULT 'draft',
  queued_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_status_check
    CHECK (status IN ('draft','scheduled','active','expired','cancelled')),
  CONSTRAINT promotions_audience_check
    CHECK (audience IN ('opted_in_investors','active_applications','outstanding_balance','property_related'))
);

GRANT SELECT, INSERT, UPDATE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read promotions"
ON public.promotions FOR SELECT TO authenticated
USING (private.is_super_admin(auth.uid()));

CREATE POLICY "Super admins create promotions"
ON public.promotions FOR INSERT TO authenticated
WITH CHECK (private.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update promotions"
ON public.promotions FOR UPDATE TO authenticated
USING (private.is_super_admin(auth.uid()))
WITH CHECK (private.is_super_admin(auth.uid()));

CREATE TRIGGER promotions_updated
BEFORE UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Marketing preference categories --------------------------------------
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS promotions_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_property_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS campaigns_opt_in boolean NOT NULL DEFAULT true;

-- 5. Listing / price-change events ----------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_listing_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid;
  v_published boolean;
BEGIN
  v_published := NEW.is_active IS TRUE AND coalesce(NEW.unit_price, 0) > 0;

  IF v_published AND (TG_OP = 'INSERT' OR OLD.is_active IS NOT TRUE) THEN
    INSERT INTO public.email_outbox (kind, category, recipient_email, payload, dedupe_key)
    VALUES (
      'new_listing', 'marketing', NULL,
      jsonb_build_object(
        'property_id', NEW.id,
        'property_name', NEW.name,
        'property_code', NEW.property_code,
        'project_id', NEW.project_id,
        'unit_price', NEW.unit_price
      ),
      'NEW_PROPERTY:' || NEW.id::text || ':PUBLISHED'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.unit_price IS DISTINCT FROM OLD.unit_price
     AND v_published THEN
    INSERT INTO public.property_price_events (property_id, previous_price, new_price, actor)
    VALUES (NEW.id, OLD.unit_price, NEW.unit_price, auth.uid())
    RETURNING id INTO v_event_id;

    INSERT INTO public.email_outbox (kind, category, recipient_email, payload, dedupe_key)
    VALUES (
      'price_change', 'marketing', NULL,
      jsonb_build_object(
        'property_id', NEW.id,
        'property_name', NEW.name,
        'property_code', NEW.property_code,
        'project_id', NEW.project_id,
        'unit_price', NEW.unit_price,
        'previous_price', OLD.unit_price,
        'price_event_id', v_event_id
      ),
      'PRICE_CHANGE:' || NEW.id::text || ':' || v_event_id::text
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN NEW;
END; $function$;

REVOKE ALL ON FUNCTION public.enqueue_listing_email() FROM PUBLIC, anon, authenticated;