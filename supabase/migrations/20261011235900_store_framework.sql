-- The adapter chosen for an analysis, and write access for the roles and
-- routes it recovered. Existing rows stay "none" until they are analysed again.

alter table public.analyses
  add column framework text not null default 'none';

alter table public.analyses
  add constraint analyses_framework_known
  check (framework in ('nextjs', 'nestjs', 'react', 'none'));

grant insert on table public.file_roles to authenticated;
grant insert on table public.routes to authenticated;

create policy "Members insert their organization's file roles"
  on public.file_roles for insert to authenticated
  with check (organization_id = (select private.organization_id()));

create policy "Members insert their organization's routes"
  on public.routes for insert to authenticated
  with check (organization_id = (select private.organization_id()));
