CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_staff(uuid) SET SCHEMA private;
ALTER FUNCTION public.can_view_application(uuid) SET SCHEMA private;

ALTER FUNCTION private.has_role(uuid, public.app_role) SET search_path TO public, private;
ALTER FUNCTION private.is_admin(uuid) SET search_path TO public, private;
ALTER FUNCTION private.is_staff(uuid) SET search_path TO public, private;
ALTER FUNCTION private.can_view_application(uuid) SET search_path TO public, private;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_view_application(uuid) TO authenticated, service_role;