-- An analysis credential is a short-lived JWT whose claims are one organization
-- (`o.id`, the same claim a Clerk session uses) and one `analysis_id`. Row
-- level security has to enforce that pair. A where clause in the route is not
-- the boundary.
--
-- A Clerk session has a subject that starts with `user_` and no analysis id, so
-- it still sees the whole organization. A credential has an analysis id and no
-- subject, so it cannot pass a member check, and it cannot write. A token with
-- neither sees nothing. The signing key could mint a broader token; the app
-- never does, and the secret API key is not involved.

create function private.analysis_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() ->> 'analysis_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'analysis_id')::uuid
    else null
  end
$$;

create function private.member_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select private.analysis_id()) is null
    and pg_catalog.starts_with(coalesce(auth.jwt() ->> 'sub', ''), 'user_')
$$;

create function private.row_in_credential(row_analysis uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select private.member_session())
    or row_analysis = (select private.analysis_id())
$$;

revoke all on function private.analysis_id() from public;
revoke all on function private.member_session() from public;
revoke all on function private.row_in_credential(uuid) from public;
grant execute on function private.analysis_id() to authenticated;
grant execute on function private.member_session() to authenticated;
grant execute on function private.row_in_credential(uuid) to authenticated;

-- Reads. The organization row is the organization itself, so it stays scoped
-- to `o.id` only. Projects hang off the one analysis when a credential is set.

alter policy "Members read their organization's projects"
  on public.projects
  using (
    organization_id = (select private.organization_id())
    and (
      (select private.member_session())
      or id = (
        select analyses.project_id
        from public.analyses
        where analyses.id = (select private.analysis_id())
      )
    )
  );

alter policy "Members read their organization's analyses"
  on public.analyses
  using (
    organization_id = (select private.organization_id())
    and (select private.row_in_credential(id))
  );

alter policy "Members read their organization's files"
  on public.files
  using (
    organization_id = (select private.organization_id())
    and (select private.row_in_credential(analysis_id))
  );

alter policy "Members read their organization's edges"
  on public.edges
  using (
    organization_id = (select private.organization_id())
    and (select private.row_in_credential(analysis_id))
  );

alter policy "Members read their organization's routes"
  on public.routes
  using (
    organization_id = (select private.organization_id())
    and (select private.row_in_credential(analysis_id))
  );

alter policy "Members read their organization's explanations"
  on public.explanations
  using (
    organization_id = (select private.organization_id())
    and (select private.row_in_credential(analysis_id))
  );

alter policy "Members read their organization's file roles"
  on public.file_roles
  using (
    organization_id = (select private.organization_id())
    and (select private.row_in_credential(analysis_id))
  );

alter policy "Members read their organization's insights"
  on public.insights
  using (
    organization_id = (select private.organization_id())
    and (select private.row_in_credential(analysis_id))
  );

alter policy "Members read their organization's AI cache"
  on public.ai_cache
  using (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

-- Writes stay with the signed-in member. A credential cannot insert, update,
-- or delete, including through replace_analysis, which runs as the invoker.

alter policy "Members insert their organization"
  on public.organizations
  with check (
    id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's projects"
  on public.projects
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's analyses"
  on public.analyses
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members update their organization's analyses"
  on public.analyses
  using (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  )
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members delete their organization's analyses"
  on public.analyses
  using (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's files"
  on public.files
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's edges"
  on public.edges
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's file roles"
  on public.file_roles
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's routes"
  on public.routes
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's explanations"
  on public.explanations
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members update their organization's explanations"
  on public.explanations
  using (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  )
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );

alter policy "Members insert their organization's AI cache"
  on public.ai_cache
  with check (
    organization_id = (select private.organization_id())
    and (select private.member_session())
  );
