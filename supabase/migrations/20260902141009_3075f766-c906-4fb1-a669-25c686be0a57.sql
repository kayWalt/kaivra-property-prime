-- Trigger functions do not require EXECUTE for the firing role, so removing
-- direct callability closes the exposed-API surface flagged by the linter.
REVOKE ALL ON FUNCTION public.validate_adviser_invitation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_application_event_actor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_adviser_invitation() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_application_event_actor() TO service_role;