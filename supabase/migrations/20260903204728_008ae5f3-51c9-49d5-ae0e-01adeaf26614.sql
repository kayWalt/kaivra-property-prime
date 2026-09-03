
DROP POLICY IF EXISTS "applications investor update" ON public.applications;
CREATE POLICY "applications investor update"
ON public.applications FOR UPDATE TO authenticated
USING (
  investor_id = auth.uid()
  AND status = ANY (ARRAY['draft'::application_status, 'requires_correction'::application_status])
)
WITH CHECK (
  investor_id = auth.uid()
  AND status = ANY (ARRAY['draft'::application_status, 'submitted'::application_status])
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

DROP POLICY IF EXISTS "Investors respond to own correction requests" ON public.correction_requests;
CREATE POLICY "Investors respond to own correction requests"
ON public.correction_requests FOR UPDATE TO authenticated
USING (
  investor_id = auth.uid()
  AND status = 'additional_info'
)
WITH CHECK (
  investor_id = auth.uid()
  AND status IN ('additional_info', 'under_review')
  AND applied_by IS NULL
  AND resolved_by IS NULL
  AND resolved_at IS NULL
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);
