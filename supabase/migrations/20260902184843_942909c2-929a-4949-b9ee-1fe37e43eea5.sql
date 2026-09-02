DROP POLICY IF EXISTS "inspections investor update" ON public.inspection_appointments;
CREATE POLICY "inspections investor update"
ON public.inspection_appointments
FOR UPDATE
TO authenticated
USING (
  investor_id = auth.uid()
  AND status IN ('requested'::inspection_status, 'confirmed'::inspection_status, 'rescheduled'::inspection_status)
)
WITH CHECK (
  investor_id = auth.uid()
  AND status IN ('requested'::inspection_status, 'confirmed'::inspection_status, 'rescheduled'::inspection_status, 'cancelled'::inspection_status)
);

DROP POLICY IF EXISTS "inspections staff update" ON public.inspection_appointments;
CREATE POLICY "inspections staff update"
ON public.inspection_appointments
FOR UPDATE
TO authenticated
USING (
  private.admin_can(auth.uid(), 'inspections'::text, 'edit'::text)
  OR (private.has_role(auth.uid(), 'adviser'::app_role) AND private.can_view_inspection(project_id, investor_id))
)
WITH CHECK (
  private.admin_can(auth.uid(), 'inspections'::text, 'edit'::text)
  OR (private.has_role(auth.uid(), 'adviser'::app_role) AND private.can_view_inspection(project_id, investor_id))
);