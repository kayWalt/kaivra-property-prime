WITH junk AS (
  SELECT a.id,
         row_number() OVER (PARTITION BY a.investor_id ORDER BY a.created_at DESC) AS rn
  FROM public.applications a
  WHERE a.status = 'draft'
    AND a.reference IS NULL
    AND a.current_step <= 2
    AND coalesce(a.personal->>'dob','') = ''
    AND coalesce(a.personal->>'nationality','') = ''
    AND coalesce(a.contact->>'address','') = ''
    AND NOT EXISTS (SELECT 1 FROM public.application_payments p WHERE p.application_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM public.application_documents d WHERE d.application_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM public.inspection_appointments i WHERE i.application_id = a.id)
)
DELETE FROM public.applications a
USING junk
WHERE a.id = junk.id AND junk.rn > 1;

CREATE INDEX IF NOT EXISTS idx_applications_open_draft
  ON public.applications (investor_id, created_at DESC)
  WHERE status = 'draft' AND reference IS NULL;