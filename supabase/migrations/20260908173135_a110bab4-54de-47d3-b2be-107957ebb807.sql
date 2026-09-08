-- 1. Remove the browser's ability to create document references directly.
--    Records are now written server-side only, after byte verification.
DROP POLICY IF EXISTS "documents insert" ON public.application_documents;
DROP POLICY IF EXISTS "Owners attach documents to their request" ON public.correction_request_documents;

-- 2. profiles.avatar_url may only be set by the verified upload service.
CREATE OR REPLACE FUNCTION public.protect_avatar_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'avatar_url can only be changed through the verified upload service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_avatar_url ON public.profiles;
CREATE TRIGGER profiles_protect_avatar_url
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_avatar_url();