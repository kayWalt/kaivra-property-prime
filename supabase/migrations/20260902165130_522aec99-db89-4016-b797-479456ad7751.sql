
-- 1. Proxy admin grants -------------------------------------------------
CREATE TABLE public.proxy_admin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  note text,
  granted_by uuid,
  revoked_by uuid,
  revoked_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.proxy_admin_grants TO authenticated;
GRANT ALL ON public.proxy_admin_grants TO service_role;
ALTER TABLE public.proxy_admin_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX proxy_admin_grants_status_idx ON public.proxy_admin_grants (status, expires_at);

CREATE TRIGGER proxy_admin_grants_updated
BEFORE UPDATE ON public.proxy_admin_grants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Role / permission helpers -----------------------------------------
CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION private.is_proxy_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private' AS $$
  SELECT EXISTS (SELECT 1 FROM public.proxy_admin_grants g WHERE g.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION private.proxy_grant_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proxy_admin_grants g
     WHERE g.user_id = _user_id
       AND g.status = 'active'
       AND g.starts_at <= now()
       AND (g.expires_at IS NULL OR g.expires_at > now())
  );
$$;

-- Administrative identity now respects proxy grant lifecycle. Super admins and
-- ordinary (non-proxy) admins keep exactly the access they had before.
CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
      OR (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
        AND (
          NOT private.is_proxy_admin(_user_id)
          OR private.proxy_grant_active(_user_id)
        )
      );
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private' AS $$
  SELECT private.is_admin(_user_id)
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'adviser');
$$;

-- Explicit module/action permission. Fails closed.
CREATE OR REPLACE FUNCTION private.admin_can(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private' AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN private.is_super_admin(_user_id) THEN true
    WHEN NOT private.is_admin(_user_id) THEN false
    WHEN NOT private.is_proxy_admin(_user_id) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.proxy_admin_grants g
       WHERE g.user_id = _user_id
         AND g.status = 'active'
         AND g.starts_at <= now()
         AND (g.expires_at IS NULL OR g.expires_at > now())
         AND (g.permissions -> _module) ? _action
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_can(_module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','private' AS $$
  SELECT private.admin_can(auth.uid(), _module, _action);
$$;
REVOKE ALL ON FUNCTION public.admin_can(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_can(text, text) TO authenticated;

-- 3. Grants table policies ---------------------------------------------
CREATE POLICY "Super admins manage proxy grants"
ON public.proxy_admin_grants FOR ALL TO authenticated
USING (private.is_super_admin(auth.uid()))
WITH CHECK (private.is_super_admin(auth.uid()));

CREATE POLICY "Proxy admins read own grant"
ON public.proxy_admin_grants FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 4. Module-scoped write policies for proxy admins ----------------------
DROP POLICY "applications staff update" ON public.applications;
CREATE POLICY "applications staff update" ON public.applications FOR UPDATE TO authenticated
USING (private.admin_can(auth.uid(),'applications','edit')
       OR (private.has_role(auth.uid(),'adviser') AND private.can_view_application(id)))
WITH CHECK (private.admin_can(auth.uid(),'applications','edit')
       OR (private.has_role(auth.uid(),'adviser') AND private.can_view_application(id)));

DROP POLICY "Admins add payment accounts" ON public.developer_payment_accounts;
CREATE POLICY "Admins add payment accounts" ON public.developer_payment_accounts FOR INSERT TO authenticated
WITH CHECK (private.admin_can(auth.uid(),'payment_accounts','create'));

DROP POLICY "Admins edit payment accounts" ON public.developer_payment_accounts;
CREATE POLICY "Admins edit payment accounts" ON public.developer_payment_accounts FOR UPDATE TO authenticated
USING (private.admin_can(auth.uid(),'payment_accounts','edit'))
WITH CHECK (private.admin_can(auth.uid(),'payment_accounts','edit'));

DROP POLICY "projects admin write" ON public.projects;
CREATE POLICY "projects admin write" ON public.projects FOR ALL TO authenticated
USING (private.admin_can(auth.uid(),'projects','manage'))
WITH CHECK (private.admin_can(auth.uid(),'projects','manage'));

DROP POLICY "properties admin write" ON public.properties;
CREATE POLICY "properties admin write" ON public.properties FOR ALL TO authenticated
USING (private.admin_can(auth.uid(),'projects','manage'))
WITH CHECK (private.admin_can(auth.uid(),'projects','manage'));

DROP POLICY "adviser links admin write" ON public.project_advisers;
CREATE POLICY "adviser links admin write" ON public.project_advisers FOR ALL TO authenticated
USING (private.admin_can(auth.uid(),'advisers','manage'))
WITH CHECK (private.admin_can(auth.uid(),'advisers','manage'));

DROP POLICY "adviser invitations admin" ON public.adviser_invitations;
CREATE POLICY "adviser invitations admin" ON public.adviser_invitations FOR ALL TO authenticated
USING (private.admin_can(auth.uid(),'advisers','manage'))
WITH CHECK (private.admin_can(auth.uid(),'advisers','manage'));

DROP POLICY "inspections admin delete" ON public.inspection_appointments;
CREATE POLICY "inspections admin delete" ON public.inspection_appointments FOR DELETE TO authenticated
USING (private.admin_can(auth.uid(),'inspections','manage'));

DROP POLICY "inspections staff update" ON public.inspection_appointments;
CREATE POLICY "inspections staff update" ON public.inspection_appointments FOR UPDATE TO authenticated
USING (private.admin_can(auth.uid(),'inspections','edit')
       OR (private.has_role(auth.uid(),'adviser') AND private.can_view_inspection(project_id, investor_id)))
WITH CHECK (true);

DROP POLICY "Owner responds, admins manage correction requests" ON public.correction_requests;
CREATE POLICY "Owner responds, admins manage correction requests" ON public.correction_requests FOR UPDATE TO authenticated
USING (investor_id = auth.uid() OR private.admin_can(auth.uid(),'corrections','resolve'))
WITH CHECK (investor_id = auth.uid() OR private.admin_can(auth.uid(),'corrections','resolve'));

DROP POLICY "Staff update support tickets" ON public.support_tickets;
CREATE POLICY "Staff update support tickets" ON public.support_tickets FOR UPDATE TO authenticated
USING (
  private.admin_can(auth.uid(),'support','resolve')
  OR (private.has_role(auth.uid(),'adviser') AND (
        assigned_to = auth.uid()
        OR EXISTS (SELECT 1 FROM public.project_advisers pa
                    WHERE pa.adviser_id = auth.uid() AND pa.project_id = support_tickets.project_id)))
)
WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY "Staff can update contact enquiries" ON public.contact_enquiries;
CREATE POLICY "Staff can update contact enquiries" ON public.contact_enquiries FOR UPDATE TO authenticated
USING (private.admin_can(auth.uid(),'enquiries','edit') OR private.has_role(auth.uid(),'adviser'))
WITH CHECK (private.admin_can(auth.uid(),'enquiries','edit') OR private.has_role(auth.uid(),'adviser'));

DROP POLICY "payments staff update" ON public.application_payments;
CREATE POLICY "payments staff update" ON public.application_payments FOR UPDATE TO authenticated
USING (
  private.can_view_application(application_id)
  AND (private.admin_can(auth.uid(),'transactions','approve') OR private.has_role(auth.uid(),'adviser'))
)
WITH CHECK (
  private.can_view_application(application_id)
  AND (private.admin_can(auth.uid(),'transactions','approve') OR private.has_role(auth.uid(),'adviser'))
);
