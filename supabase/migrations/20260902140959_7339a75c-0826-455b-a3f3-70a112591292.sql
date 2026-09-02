-- 1. AVATARS: bind folder-based access to a verified account ------------------
-- The folder segment must be a real profile id AND the caller's own id, so
-- access no longer rests on a naming convention alone.
CREATE OR REPLACE FUNCTION private.owns_avatar_folder(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (storage.foldername(object_name))[1] = (auth.uid())::text
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid());
$$;

DROP POLICY IF EXISTS "avatars owner read" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;

CREATE POLICY "avatars owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND private.owns_avatar_folder(name));

CREATE POLICY "avatars owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND private.owns_avatar_folder(name));

CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND private.owns_avatar_folder(name))
  WITH CHECK (bucket_id = 'avatars' AND private.owns_avatar_folder(name));

CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND private.owns_avatar_folder(name));

-- 2. PROJECT IMAGES: only expose media attached to live listings --------------
CREATE OR REPLACE FUNCTION private.is_public_project_image(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.is_active
       AND (position(object_name IN coalesce(p.hero_image, '')) > 0
            OR position(object_name IN coalesce(p.gallery_images::text, '')) > 0)
  ) OR EXISTS (
    SELECT 1
      FROM public.properties pr
      JOIN public.projects p2 ON p2.id = pr.project_id
     WHERE pr.is_active AND p2.is_active
       AND position(object_name IN coalesce(pr.image_urls::text, '')) > 0
  );
$$;

DROP POLICY IF EXISTS "project_images_public_read" ON storage.objects;

-- Public reads are limited to media referenced by an active project/property.
-- The one-hour window keeps the admin upload preview working (object names
-- carry a random UUID, so they are not enumerable) before the image is saved
-- onto a listing; staff/admin policies continue to cover everything else.
CREATE POLICY "project images public read active" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'project-images'
    AND (
      private.is_public_project_image(name)
      OR created_at > now() - interval '1 hour'
    )
  );

-- 3. ADVISER INVITATIONS: validate the project scope --------------------------
CREATE OR REPLACE FUNCTION public.validate_adviser_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_unknown integer;
BEGIN
  IF NEW.project_ids IS NULL THEN
    NEW.project_ids := '{}'::uuid[];
  END IF;

  -- Drop duplicates and NULL entries so the granted scope is unambiguous.
  SELECT array_agg(DISTINCT pid) INTO NEW.project_ids
    FROM unnest(NEW.project_ids) AS pid
   WHERE pid IS NOT NULL;
  NEW.project_ids := coalesce(NEW.project_ids, '{}'::uuid[]);

  SELECT count(*) INTO v_unknown
    FROM unnest(NEW.project_ids) AS pid
   WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pid);

  IF v_unknown > 0 THEN
    RAISE EXCEPTION 'Adviser invitation references % project(s) that do not exist', v_unknown;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS adviser_invitations_validate ON public.adviser_invitations;
CREATE TRIGGER adviser_invitations_validate
  BEFORE INSERT OR UPDATE ON public.adviser_invitations
  FOR EACH ROW EXECUTE FUNCTION public.validate_adviser_invitation();

-- 4. APPLICATION EVENTS: immutable, non-spoofable audit trail -----------------
CREATE OR REPLACE FUNCTION public.enforce_application_event_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  -- Staff (advisers/admins) may record events on behalf of an investor, e.g.
  -- assisted applications; everyone else is pinned to their own identity.
  IF NOT private.is_staff(auth.uid()) THEN
    NEW.actor := auth.uid();
    NEW.actor_name := coalesce(
      (SELECT p.full_name FROM public.profiles p WHERE p.id = auth.uid()),
      NEW.actor_name
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_events_actor ON public.application_events;
CREATE TRIGGER application_events_actor
  BEFORE INSERT ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_application_event_actor();

-- No update/delete policy exists, so RLS already denies edits; revoking the
-- table privileges makes the append-only guarantee explicit.
REVOKE UPDATE, DELETE, TRUNCATE ON public.application_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;