CREATE POLICY "avatars staff read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND private.is_staff(auth.uid()));