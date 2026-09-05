
-- 1. Per-user email preferences -------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.email_preferences TO authenticated;
GRANT ALL ON public.email_preferences TO service_role;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_prefs_select_own" ON public.email_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "email_prefs_insert_own" ON public.email_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "email_prefs_update_own" ON public.email_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- The unsubscribe token is a credential: users may never set or rotate it.
CREATE OR REPLACE FUNCTION public.pin_email_pref_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.unsubscribe_token := OLD.unsubscribe_token;
    NEW.user_id := OLD.user_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.pin_email_pref_token() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pin_email_pref_token ON public.email_preferences;
CREATE TRIGGER pin_email_pref_token BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.pin_email_pref_token();

-- 2. Email queue / delivery log --------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  category text NOT NULL DEFAULT 'transactional',
  recipient_email text,
  recipient_user_id uuid,
  subject text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  provider_message_id text,
  test_mode boolean NOT NULL DEFAULT true,
  delivered_to text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_outbox_category_chk CHECK (category IN ('transactional','marketing')),
  CONSTRAINT email_outbox_status_chk CHECK (status IN ('pending','sent','failed','skipped','expanded','cancelled'))
);
CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON public.email_outbox (status, scheduled_for);
CREATE INDEX IF NOT EXISTS email_outbox_created_idx ON public.email_outbox (created_at DESC);

-- Fail-closed: no anon/authenticated access at all. Server code only.
REVOKE ALL ON public.email_outbox FROM anon, authenticated;
GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

-- 3. Super Admin announcements ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  heading text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_url text,
  audience text NOT NULL,
  category text NOT NULL DEFAULT 'marketing',
  test_mode boolean NOT NULL DEFAULT true,
  queued_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.email_campaigns FROM anon, authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- 4. Automatic queueing triggers -------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_application_status_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'draft' THEN RETURN NEW; END IF;

  v_email := lower(nullif(trim(coalesce(NEW.contact->>'email', '')), ''));
  IF v_email IS NULL THEN
    SELECT lower(email) INTO v_email FROM public.profiles WHERE id = NEW.investor_id;
  END IF;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.email_outbox (kind, category, recipient_email, recipient_user_id, payload, dedupe_key)
  VALUES (
    'application_status', 'transactional', v_email, NEW.investor_id,
    jsonb_build_object(
      'application_id', NEW.id,
      'reference', coalesce(NEW.partner_reference, NEW.reference),
      'status', NEW.status,
      'review_note', NEW.review_note,
      'full_name', coalesce(NEW.personal->>'full_name', '')
    ),
    'app_status:' || NEW.id::text || ':' || NEW.status::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_application_status_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enqueue_application_status_email ON public.applications;
CREATE TRIGGER enqueue_application_status_email AFTER UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_application_status_email();

CREATE OR REPLACE FUNCTION public.enqueue_listing_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text;
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active IS NOT TRUE THEN RETURN NEW; END IF;
    v_kind := 'new_listing';
    v_key := 'listing:' || NEW.id::text;
  ELSE
    IF NEW.is_active IS TRUE AND OLD.is_active IS NOT TRUE THEN
      v_kind := 'new_listing';
      v_key := 'listing:' || NEW.id::text;
    ELSIF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
      v_kind := 'price_change';
      v_key := 'price:' || NEW.id::text || ':' || NEW.unit_price::text;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Broadcast row: expanded into per-recipient rows by the server at send time.
  INSERT INTO public.email_outbox (kind, category, recipient_email, payload, dedupe_key)
  VALUES (
    v_kind, 'marketing', NULL,
    jsonb_build_object(
      'property_id', NEW.id,
      'property_name', NEW.name,
      'property_code', NEW.property_code,
      'project_id', NEW.project_id,
      'unit_price', NEW.unit_price,
      'previous_price', CASE WHEN TG_OP = 'UPDATE' THEN OLD.unit_price ELSE NULL END
    ),
    v_key
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_listing_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enqueue_listing_email ON public.properties;
CREATE TRIGGER enqueue_listing_email AFTER INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_listing_email();
