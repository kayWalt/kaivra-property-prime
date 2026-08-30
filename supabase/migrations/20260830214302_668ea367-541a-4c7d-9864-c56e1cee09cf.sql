CREATE POLICY "notifications delete own" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "kaivra docs read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'kaivra-docs' AND (
    owner = auth.uid() OR EXISTS (
      SELECT 1 FROM public.application_documents d
      WHERE d.file_path = storage.objects.name
        AND private.can_view_application(d.application_id)
    )
  )
);

CREATE POLICY "kaivra docs insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kaivra-docs' AND owner = auth.uid());

CREATE POLICY "kaivra docs update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'kaivra-docs' AND owner = auth.uid())
WITH CHECK (bucket_id = 'kaivra-docs' AND owner = auth.uid());

CREATE POLICY "kaivra docs delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'kaivra-docs' AND (
    owner = auth.uid() OR EXISTS (
      SELECT 1 FROM public.application_documents d
      WHERE d.file_path = storage.objects.name
        AND private.can_view_application(d.application_id)
        AND private.is_admin(auth.uid())
    )
  )
);