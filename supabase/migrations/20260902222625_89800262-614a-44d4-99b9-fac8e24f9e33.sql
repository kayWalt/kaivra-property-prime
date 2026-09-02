REVOKE EXECUTE ON FUNCTION public.touch_proxy_admin_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_proxy_admin_activity() TO authenticated;