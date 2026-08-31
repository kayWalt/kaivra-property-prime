-- Avatars bucket: each user may only touch files inside their own user-id folder.
DROP POLICY IF EXISTS "avatars owner read" ON storage.objects;
CREATE POLICY "avatars owner read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND owner = auth.uid() OR (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text));

DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
CREATE POLICY "avatars owner insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Project images bucket: staff may read, only admins may write.
DROP POLICY IF EXISTS "project images staff read" ON storage.objects;
CREATE POLICY "project images staff read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-images' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "project images admin insert" ON storage.objects;
CREATE POLICY "project images admin insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-images' AND private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "project images admin update" ON storage.objects;
CREATE POLICY "project images admin update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-images' AND private.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'project-images' AND private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "project images admin delete" ON storage.objects;
CREATE POLICY "project images admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-images' AND private.is_admin(auth.uid()));

-- user_roles: explicit, tightly-scoped update path for administrators.
DROP POLICY IF EXISTS "roles admin update" ON public.user_roles;
CREATE POLICY "roles admin update" ON public.user_roles FOR UPDATE TO authenticated
USING (private.is_admin(auth.uid()) AND role = ANY (ARRAY['adviser'::app_role, 'investor'::app_role]))
WITH CHECK (private.is_admin(auth.uid()) AND role = ANY (ARRAY['adviser'::app_role, 'investor'::app_role]));

GRANT UPDATE ON public.user_roles TO authenticated;