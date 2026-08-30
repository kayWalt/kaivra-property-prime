REVOKE ALL ON FUNCTION public.enforce_application_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_payment_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_document_integrity() FROM PUBLIC, anon, authenticated;