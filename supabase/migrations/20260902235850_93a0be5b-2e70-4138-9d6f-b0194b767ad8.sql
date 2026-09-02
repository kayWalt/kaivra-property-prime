
create or replace function private.adviser_can_see_investor(_adviser uuid, _investor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    where a.investor_id = _investor
      and (
        a.adviser_id = _adviser
        or exists (
          select 1 from public.project_advisers pa
          where pa.adviser_id = _adviser and pa.project_id = a.project_id
        )
      )
  )
  or exists (
    select 1
    from public.inspection_appointments i
    where i.investor_id = _investor
      and (
        i.assigned_adviser = _adviser
        or exists (
          select 1 from public.project_advisers pa
          where pa.adviser_id = _adviser and pa.project_id = i.project_id
        )
      )
  )
$$;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or private.admin_view('investors')
  or private.admin_view('applications')
  or (
    private.has_role(auth.uid(), 'adviser'::app_role)
    and private.adviser_can_see_investor(auth.uid(), id)
  )
);

drop policy if exists "Staff can read contact enquiries" on public.contact_enquiries;
create policy "Staff can read contact enquiries" on public.contact_enquiries
for select to authenticated
using (private.admin_view('enquiries'));

drop policy if exists "Staff can update contact enquiries" on public.contact_enquiries;
create policy "Staff can update contact enquiries" on public.contact_enquiries
for update to authenticated
using (private.admin_can(auth.uid(), 'enquiries', 'edit'))
with check (private.admin_can(auth.uid(), 'enquiries', 'edit'));
