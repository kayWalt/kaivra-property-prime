REVOKE ALL ON public.visitor_sessions FROM anon, authenticated;
REVOKE ALL ON public.activity_events FROM anon, authenticated;
REVOKE ALL ON public.analytics_settings FROM anon, authenticated;
GRANT ALL ON public.visitor_sessions TO service_role;
GRANT ALL ON public.activity_events TO service_role;
GRANT ALL ON public.analytics_settings TO service_role;