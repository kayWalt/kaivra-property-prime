UPDATE public.proxy_admin_grants
SET permissions = permissions - 'analytics'
WHERE permissions ? 'analytics';