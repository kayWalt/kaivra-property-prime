GRANT INSERT, DELETE ON public.user_roles TO authenticated;

CREATE POLICY "roles admin insert" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (private.is_admin(auth.uid()) AND role IN ('adviser'::app_role, 'investor'::app_role));

CREATE POLICY "roles admin delete" ON public.user_roles
FOR DELETE TO authenticated
USING (private.is_admin(auth.uid()) AND role IN ('adviser'::app_role, 'investor'::app_role));