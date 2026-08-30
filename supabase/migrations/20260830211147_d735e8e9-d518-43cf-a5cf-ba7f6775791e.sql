-- application_documents
DROP POLICY IF EXISTS "documents read" ON public.application_documents;
DROP POLICY IF EXISTS "documents insert" ON public.application_documents;
DROP POLICY IF EXISTS "documents delete" ON public.application_documents;
CREATE POLICY "documents read" ON public.application_documents FOR SELECT TO authenticated USING (private.can_view_application(application_id));
CREATE POLICY "documents insert" ON public.application_documents FOR INSERT TO authenticated WITH CHECK (private.can_view_application(application_id));
CREATE POLICY "documents delete" ON public.application_documents FOR DELETE TO authenticated USING (private.can_view_application(application_id));

-- application_events
DROP POLICY IF EXISTS "events read" ON public.application_events;
DROP POLICY IF EXISTS "events insert" ON public.application_events;
CREATE POLICY "events read" ON public.application_events FOR SELECT TO authenticated USING (private.can_view_application(application_id));
CREATE POLICY "events insert" ON public.application_events FOR INSERT TO authenticated WITH CHECK (private.can_view_application(application_id));

-- application_payments
DROP POLICY IF EXISTS "payments read" ON public.application_payments;
DROP POLICY IF EXISTS "payments write" ON public.application_payments;
DROP POLICY IF EXISTS "payments update" ON public.application_payments;
DROP POLICY IF EXISTS "payments delete" ON public.application_payments;
CREATE POLICY "payments read" ON public.application_payments FOR SELECT TO authenticated USING (private.can_view_application(application_id));
CREATE POLICY "payments write" ON public.application_payments FOR INSERT TO authenticated WITH CHECK (private.can_view_application(application_id));
CREATE POLICY "payments update" ON public.application_payments FOR UPDATE TO authenticated USING (private.can_view_application(application_id)) WITH CHECK (private.can_view_application(application_id));
CREATE POLICY "payments delete" ON public.application_payments FOR DELETE TO authenticated USING (private.can_view_application(application_id));

-- applications
DROP POLICY IF EXISTS "applications read" ON public.applications;
DROP POLICY IF EXISTS "applications insert" ON public.applications;
DROP POLICY IF EXISTS "applications investor update" ON public.applications;
DROP POLICY IF EXISTS "applications staff update" ON public.applications;
DROP POLICY IF EXISTS "applications investor delete drafts" ON public.applications;
CREATE POLICY "applications read" ON public.applications FOR SELECT TO authenticated USING (
  investor_id = auth.uid() OR private.is_admin(auth.uid()) OR (
    private.has_role(auth.uid(), 'adviser') AND (
      adviser_id = auth.uid() OR EXISTS (SELECT 1 FROM public.project_advisers pa WHERE pa.project_id = applications.project_id AND pa.adviser_id = auth.uid())
    )
  )
);
CREATE POLICY "applications insert" ON public.applications FOR INSERT TO authenticated WITH CHECK (
  (investor_id = auth.uid() AND created_by = auth.uid()) OR private.is_staff(auth.uid())
);
CREATE POLICY "applications investor update" ON public.applications FOR UPDATE TO authenticated
  USING (investor_id = auth.uid() AND status = ANY (ARRAY['draft'::application_status,'requires_correction'::application_status]))
  WITH CHECK (investor_id = auth.uid());
CREATE POLICY "applications staff update" ON public.applications FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()) OR (private.has_role(auth.uid(),'adviser') AND private.can_view_application(id)))
  WITH CHECK (true);
CREATE POLICY "applications investor delete drafts" ON public.applications FOR DELETE TO authenticated
  USING ((investor_id = auth.uid() AND status = 'draft'::application_status) OR private.is_admin(auth.uid()));

-- projects / properties / profiles / roles / adviser links / notifications
DROP POLICY IF EXISTS "projects public read" ON public.projects;
DROP POLICY IF EXISTS "projects admin write" ON public.projects;
CREATE POLICY "projects public read" ON public.projects FOR SELECT TO anon, authenticated USING (is_active OR private.is_staff(auth.uid()));
CREATE POLICY "projects admin write" ON public.projects FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "properties public read" ON public.properties;
DROP POLICY IF EXISTS "properties admin write" ON public.properties;
CREATE POLICY "properties public read" ON public.properties FOR SELECT TO anon, authenticated USING (is_active OR private.is_staff(auth.uid()));
CREATE POLICY "properties admin write" ON public.properties FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "roles read" ON public.user_roles;
CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "adviser links read" ON public.project_advisers;
DROP POLICY IF EXISTS "adviser links admin write" ON public.project_advisers;
CREATE POLICY "adviser links read" ON public.project_advisers FOR SELECT TO authenticated USING (adviser_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY "adviser links admin write" ON public.project_advisers FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "notifications insert staff" ON public.notifications;
CREATE POLICY "notifications insert staff" ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR private.is_staff(auth.uid()));