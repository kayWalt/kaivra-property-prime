
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','adviser','investor');
CREATE TYPE public.application_status AS ENUM ('draft','submitted','under_review','payment_verification','approved','rejected','requires_correction');
CREATE TYPE public.doc_kind AS ENUM ('passport','signature','proof_of_payment','additional');
CREATE TYPE public.payment_method AS ENUM ('bank_transfer','bank_deposit','pos','cash','other');
CREATE TYPE public.payment_status AS ENUM ('pending','verified','rejected');

-- UTIL
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'));
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin','adviser'));
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investor') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PROJECTS
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'NGN',
  banks jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_plans jsonb NOT NULL DEFAULT '["Outright","Installment","Custom"]'::jsonb,
  hero_image text,
  gallery_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  self_registration_open boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.projects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects public read" ON public.projects FOR SELECT TO anon, authenticated USING (is_active OR public.is_staff(auth.uid()));
CREATE POLICY "projects admin write" ON public.projects FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  property_type text NOT NULL DEFAULT '',
  size_label text NOT NULL DEFAULT '',
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  units_available integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_plan text NOT NULL DEFAULT 'Outright / Installment',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.properties TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "properties public read" ON public.properties FOR SELECT TO anon, authenticated USING (is_active OR public.is_staff(auth.uid()));
CREATE POLICY "properties admin write" ON public.properties FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.project_advisers (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  adviser_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, adviser_id)
);
GRANT SELECT ON public.project_advisers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_advisers TO authenticated;
GRANT ALL ON public.project_advisers TO service_role;
ALTER TABLE public.project_advisers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adviser links read" ON public.project_advisers FOR SELECT TO authenticated USING (adviser_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "adviser links admin write" ON public.project_advisers FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- APPLICATIONS
CREATE SEQUENCE public.application_reference_seq START 1;
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE,
  investor_id uuid NOT NULL,
  created_by uuid,
  application_method text NOT NULL DEFAULT 'self',
  adviser_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  status public.application_status NOT NULL DEFAULT 'draft',
  current_step integer NOT NULL DEFAULT 1,
  personal jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  investment jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  declaration_accepted boolean NOT NULL DEFAULT false,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_application(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = _app_id AND (
      a.investor_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR (public.has_role(auth.uid(),'adviser') AND (
            a.adviser_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.project_advisers pa WHERE pa.project_id = a.project_id AND pa.adviser_id = auth.uid())
      ))
    )
  );
$$;

CREATE POLICY "applications read" ON public.applications FOR SELECT TO authenticated USING (
  investor_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR (public.has_role(auth.uid(),'adviser') AND (adviser_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.project_advisers pa WHERE pa.project_id = applications.project_id AND pa.adviser_id = auth.uid())))
);
CREATE POLICY "applications insert" ON public.applications FOR INSERT TO authenticated WITH CHECK (
  (investor_id = auth.uid() AND created_by = auth.uid()) OR public.is_staff(auth.uid())
);
CREATE POLICY "applications investor update" ON public.applications FOR UPDATE TO authenticated USING (
  investor_id = auth.uid() AND status IN ('draft','requires_correction')
) WITH CHECK (investor_id = auth.uid());
CREATE POLICY "applications staff update" ON public.applications FOR UPDATE TO authenticated USING (
  public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'adviser') AND public.can_view_application(id))
) WITH CHECK (true);
CREATE POLICY "applications investor delete drafts" ON public.applications FOR DELETE TO authenticated USING (
  (investor_id = auth.uid() AND status = 'draft') OR public.is_admin(auth.uid())
);
CREATE TRIGGER applications_updated BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assign_application_reference() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'draft' AND NEW.reference IS NULL THEN
    NEW.reference := 'KVR-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.application_reference_seq')::text, 6, '0');
  END IF;
  IF NEW.status <> 'draft' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER applications_reference BEFORE INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.assign_application_reference();

CREATE TABLE public.application_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_on date,
  bank text,
  sender text,
  reference text,
  method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  description text,
  cash_details text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_payments TO authenticated;
GRANT ALL ON public.application_payments TO service_role;
ALTER TABLE public.application_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read" ON public.application_payments FOR SELECT TO authenticated USING (public.can_view_application(application_id));
CREATE POLICY "payments write" ON public.application_payments FOR INSERT TO authenticated WITH CHECK (public.can_view_application(application_id));
CREATE POLICY "payments update" ON public.application_payments FOR UPDATE TO authenticated USING (public.can_view_application(application_id)) WITH CHECK (public.can_view_application(application_id));
CREATE POLICY "payments delete" ON public.application_payments FOR DELETE TO authenticated USING (public.can_view_application(application_id));

CREATE TABLE public.application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.application_payments(id) ON DELETE SET NULL,
  kind public.doc_kind NOT NULL,
  label text,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_documents TO authenticated;
GRANT ALL ON public.application_documents TO service_role;
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents read" ON public.application_documents FOR SELECT TO authenticated USING (public.can_view_application(application_id));
CREATE POLICY "documents insert" ON public.application_documents FOR INSERT TO authenticated WITH CHECK (public.can_view_application(application_id));
CREATE POLICY "documents delete" ON public.application_documents FOR DELETE TO authenticated USING (public.can_view_application(application_id));

CREATE TABLE public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  actor uuid,
  actor_name text,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events read" ON public.application_events FOR SELECT TO authenticated USING (public.can_view_application(application_id));
CREATE POLICY "events insert" ON public.application_events FOR INSERT TO authenticated WITH CHECK (public.can_view_application(application_id));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications read own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications update own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications insert staff" ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- SEED
INSERT INTO public.projects (id, name, location, description, hero_image, banks, is_active)
VALUES
 ('11111111-1111-4111-8111-111111111111','HUTU PRESTIGE MOUNTAIN RESORT PHASE 2','Idu Karmo, Abuja','Premium residential investment opportunity set against a dramatic mountain backdrop, with fully serviced infrastructure, gated security and resort-grade amenities.','/images/project-mountain.jpg','["Zenith Bank","GTBank","Access Bank"]'::jsonb,true),
 ('22222222-2222-4222-8222-222222222222','HUTU PRESTIGE POLO LAKE RESORT ESTATE','Lakowe, Lagos','A lakefront resort estate combining waterfront living with a world-class polo and leisure lifestyle, designed for long-term capital appreciation.','/images/project-lake.jpg','["Zenith Bank","GTBank"]'::jsonb,true);

INSERT INTO public.properties (project_id, name, property_type, size_label, unit_price, units_available, description, image_urls) VALUES
 ('11111111-1111-4111-8111-111111111111','3 Bedroom Terrace Duplex','Terrace Duplex','150 SQM',7000000,12,'Efficient three bedroom terrace duplex with private parking.','["/images/property-terrace.jpg"]'::jsonb),
 ('11111111-1111-4111-8111-111111111111','4 Bedroom Terrace Duplex + BQ','Terrace Duplex + BQ','250 SQM',10000000,8,'Four bedroom terrace duplex with boys quarters.','["/images/property-terrace.jpg"]'::jsonb),
 ('11111111-1111-4111-8111-111111111111','4 Bedroom Fully Detached Duplex + BQ','Fully Detached Duplex','400 SQM',18000000,5,'Fully detached duplex on a generous plot with BQ.','["/images/property-detached.jpg"]'::jsonb),
 ('11111111-1111-4111-8111-111111111111','5 Bedroom Fully Detached Duplex + BQ','Fully Detached Duplex','500 SQM',22000000,3,'Signature five bedroom detached residence with BQ.','["/images/property-detached.jpg"]'::jsonb),
 ('22222222-2222-4222-8222-222222222222','4 Bedroom Lakeview Terrace','Terrace Duplex','300 SQM',12500000,10,'Lakeview terrace residence with panoramic water views.','["/images/property-terrace.jpg"]'::jsonb),
 ('22222222-2222-4222-8222-222222222222','5 Bedroom Detached Lakehouse + BQ','Fully Detached Duplex','600 SQM',26000000,4,'Detached lakehouse with private garden and BQ.','["/images/property-detached.jpg"]'::jsonb);
