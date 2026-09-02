-- Module-level READ enforcement for Proxy Admins.
-- Regular admins and Super Admins are unaffected (admin_can returns true for
-- them); a proxy admin only ever reads modules their active grant allows.

CREATE OR REPLACE FUNCTION private.admin_view(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','private'
AS $$ SELECT private.admin_can(auth.uid(), _module, 'view') $$;

CREATE OR REPLACE FUNCTION private.can_view_application(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','private'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = _app_id AND (
      a.investor_id = auth.uid()
      OR private.admin_view('applications')
      OR private.admin_view('transactions')
      OR (private.has_role(auth.uid(),'adviser') AND (
            a.adviser_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.project_advisers pa WHERE pa.project_id = a.project_id AND pa.adviser_id = auth.uid())
      ))
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_inspection(_project_id uuid, _investor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','private'
AS $$
  SELECT _investor_id = auth.uid()
      OR private.admin_view('inspections')
      OR (
        private.has_role(auth.uid(), 'adviser')
        AND EXISTS (
          SELECT 1 FROM public.project_advisers pa
          WHERE pa.project_id = _project_id AND pa.adviser_id = auth.uid()
        )
      );
$$;

DROP POLICY IF EXISTS "applications read" ON public.applications;
CREATE POLICY "applications read" ON public.applications FOR SELECT TO authenticated
USING (
  investor_id = auth.uid()
  OR private.admin_view('applications')
  OR (private.has_role(auth.uid(),'adviser') AND (
        adviser_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.project_advisers pa WHERE pa.project_id = applications.project_id AND pa.adviser_id = auth.uid())))
);

DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR private.admin_view('investors')
  OR private.admin_view('applications')
  OR private.has_role(auth.uid(),'adviser')
);

DROP POLICY IF EXISTS "Staff can read contact enquiries" ON public.contact_enquiries;
CREATE POLICY "Staff can read contact enquiries" ON public.contact_enquiries FOR SELECT TO authenticated
USING (private.admin_view('enquiries') OR private.has_role(auth.uid(),'adviser'));

DROP POLICY IF EXISTS "Correction requests readable by owner and staff" ON public.correction_requests;
CREATE POLICY "Correction requests readable by owner and staff" ON public.correction_requests FOR SELECT TO authenticated
USING (investor_id = auth.uid() OR private.admin_view('corrections') OR private.has_role(auth.uid(),'adviser'));

DROP POLICY IF EXISTS "Investors read own support tickets" ON public.support_tickets;
CREATE POLICY "Investors read own support tickets" ON public.support_tickets FOR SELECT TO authenticated
USING (
  investor_id = auth.uid()
  OR private.admin_view('support')
  OR (private.has_role(auth.uid(),'adviser') AND (
        assigned_to = auth.uid()
        OR EXISTS (SELECT 1 FROM public.project_advisers pa WHERE pa.adviser_id = auth.uid() AND pa.project_id = support_tickets.project_id)))
);

DROP POLICY IF EXISTS "Read support messages on visible tickets" ON public.support_messages;
CREATE POLICY "Read support messages on visible tickets" ON public.support_messages FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = support_messages.ticket_id)
  AND (
    private.admin_view('support')
    OR private.has_role(auth.uid(),'adviser')
    OR (is_internal = false AND EXISTS (
        SELECT 1 FROM public.support_tickets t WHERE t.id = support_messages.ticket_id AND t.investor_id = auth.uid()))
  )
);

DROP POLICY IF EXISTS "Active accounts readable, admins see all" ON public.developer_payment_accounts;
CREATE POLICY "Active accounts readable, admins see all" ON public.developer_payment_accounts FOR SELECT TO authenticated
USING (private.admin_view('payment_accounts') OR (status = 'active' AND archived_at IS NULL));

DROP POLICY IF EXISTS "Admins read payment account audit log" ON public.payment_account_audit_log;
CREATE POLICY "Admins read payment account audit log" ON public.payment_account_audit_log FOR SELECT TO authenticated
USING (private.admin_can(auth.uid(),'payment_accounts','manage'));

DROP POLICY IF EXISTS "adviser links read" ON public.project_advisers;
CREATE POLICY "adviser links read" ON public.project_advisers FOR SELECT TO authenticated
USING (adviser_id = auth.uid() OR private.admin_view('advisers') OR private.admin_view('applications'));

-- The digital footprint is a Super Admin instrument: proxy admins may append
-- their own events but can never read, alter or erase the trail.
DROP POLICY IF EXISTS "admin audit read" ON public.admin_audit_events;
CREATE POLICY "admin audit read" ON public.admin_audit_events FOR SELECT TO authenticated
USING (private.is_super_admin(auth.uid()));

-- System-wide assistant configuration is a sensitive setting.
DROP POLICY IF EXISTS "Admins change AI settings" ON public.ai_settings;
CREATE POLICY "Admins change AI settings" ON public.ai_settings FOR UPDATE TO authenticated
USING (private.is_super_admin(auth.uid()) OR private.admin_can(auth.uid(),'support','resolve'))
WITH CHECK (private.is_super_admin(auth.uid()) OR private.admin_can(auth.uid(),'support','resolve'));

DROP POLICY IF EXISTS "Admins seed AI settings" ON public.ai_settings;
CREATE POLICY "Admins seed AI settings" ON public.ai_settings FOR INSERT TO authenticated
WITH CHECK (private.is_super_admin(auth.uid()) OR private.admin_can(auth.uid(),'support','resolve'));

-- Records the moment of a proxy admin's most recent privileged activity.
CREATE OR REPLACE FUNCTION public.touch_proxy_admin_activity()
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = 'public','private'
AS $$
  UPDATE public.proxy_admin_grants SET last_activity_at = now() WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.touch_proxy_admin_activity() TO authenticated;