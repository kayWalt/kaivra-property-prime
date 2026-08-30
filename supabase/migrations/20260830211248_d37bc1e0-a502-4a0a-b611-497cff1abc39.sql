CREATE OR REPLACE FUNCTION private.can_view_application(_app_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public, private
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = _app_id AND (
      a.investor_id = auth.uid()
      OR private.is_admin(auth.uid())
      OR (private.has_role(auth.uid(),'adviser') AND (
            a.adviser_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.project_advisers pa WHERE pa.project_id = a.project_id AND pa.adviser_id = auth.uid())
      ))
    )
  );
$function$;