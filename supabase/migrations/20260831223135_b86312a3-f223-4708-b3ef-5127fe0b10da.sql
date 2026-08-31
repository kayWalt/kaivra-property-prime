DO $$
DECLARE r record;
BEGIN
  ALTER TABLE public.profiles DISABLE TRIGGER profiles_investor_code;
  FOR r IN SELECT id, created_at FROM public.profiles WHERE investor_code IS NULL OR investor_code NOT LIKE 'KVR-I-%' LOOP
    UPDATE public.profiles
       SET investor_code = private.kaivra_unique_ref('KVR-I', 6, 'public.profiles', 'investor_code', r.created_at)
     WHERE id = r.id;
  END LOOP;
  ALTER TABLE public.profiles ENABLE TRIGGER profiles_investor_code;

  ALTER TABLE public.applications DISABLE TRIGGER applications_integrity;
  ALTER TABLE public.applications DISABLE TRIGGER applications_reference;
  FOR r IN SELECT id, coalesce(submitted_at, created_at) AS created_at FROM public.applications
            WHERE reference IS NOT NULL AND reference NOT LIKE 'KVR-A-%' LOOP
    UPDATE public.applications
       SET reference = private.kaivra_unique_ref('KVR-A', 8, 'public.applications', 'reference', r.created_at)
     WHERE id = r.id;
  END LOOP;
  ALTER TABLE public.applications ENABLE TRIGGER applications_integrity;
  ALTER TABLE public.applications ENABLE TRIGGER applications_reference;
END $$;