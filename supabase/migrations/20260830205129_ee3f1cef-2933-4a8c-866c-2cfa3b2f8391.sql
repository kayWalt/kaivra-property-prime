-- Public (anonymous) visitors must be able to read active projects/properties.
-- The public SELECT policies call public.is_staff(), so anon needs EXECUTE on it.
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO anon;
GRANT SELECT ON public.projects TO anon;
GRANT SELECT ON public.properties TO anon;