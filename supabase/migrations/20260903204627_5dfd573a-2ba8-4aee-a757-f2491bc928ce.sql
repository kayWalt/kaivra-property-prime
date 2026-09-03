
REVOKE EXECUTE ON FUNCTION public.lock_investor_payment_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assert_payment_account_allowed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.lock_application_ownership() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_application_reassignment() FROM anon, authenticated, public;
