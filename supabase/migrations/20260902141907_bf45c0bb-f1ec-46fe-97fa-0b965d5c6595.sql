DROP POLICY IF EXISTS "project images public read active" ON storage.objects;
CREATE POLICY "project images public read active" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'project-images' AND private.is_public_project_image(name));