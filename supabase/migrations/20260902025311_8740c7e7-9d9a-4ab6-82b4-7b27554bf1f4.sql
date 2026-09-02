DROP POLICY IF EXISTS "project_images_public_read" ON storage.objects;
CREATE POLICY "project_images_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'project-images');