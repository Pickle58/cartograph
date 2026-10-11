-- The workspace schema. Every row belongs to an organization, and the only
-- thing deciding who may read it is the policy at the bottom of this file.

-- ---------------------------------------------------------------------------
-- Row-level security on by default
-- ---------------------------------------------------------------------------
-- A table someone forgot to secure returns everything, silently; a secured
-- table with no policy returns nothing, visibly. So enabling RLS isn't left to
-- each migration: any table created in `public` gets it the moment it exists.
--
-- This replaces the trigger Supabase installs from the dashboard's "automatic
-- RLS" option, so the guarantee lives in version control, and so a failure to
-- enable RLS aborts the CREATE TABLE instead of being written to a log.

drop event trigger if exists ensure_rls;
drop function if exists public.rls_auto_enable();

create schema if not exists private;

create function private.enable_rls_on_new_table()
returns event_trigger
language plpgsql
set search_path = ''
as $$
declare
  cmd record;
begin
  for cmd in
    select object_identity
    from pg_catalog.pg_event_trigger_ddl_commands()
    where schema_name = 'public'
      and object_type in ('table', 'partitioned table')
  loop
    execute format('alter table %s enable row level security', cmd.object_identity);
  end loop;
end;
$$;

create event trigger enable_rls_on_new_table
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.enable_rls_on_new_table();

-- ---------------------------------------------------------------------------
-- The organization claim
-- ---------------------------------------------------------------------------
-- Clerk's v2 session token carries the active organization as `o.id`. The
-- token is verified by Supabase's Clerk third-party auth integration before
-- `auth.jwt()` returns it. Policies call this through `(select ...)` so it's
-- evaluated once per statement, not once per row.

create function private.organization_id()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() -> 'o' ->> 'id'
$$;

grant usage on schema private to authenticated;
revoke all on function private.organization_id() from public;
grant execute on function private.organization_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
-- Enums rather than check constraints so the generated TypeScript types carry
-- the same closed set the database enforces.

create type public.analysis_status as enum ('queued', 'running', 'complete', 'failed');
create type public.import_kind as enum ('import', 're-export', 'dynamic-import', 'require');
create type public.file_role_source as enum ('convention', 'ai');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- Every table carries organization_id directly, so each policy is one
-- comparison with no joins. Children reference their parent by
-- (organization, parent) so a row can't claim one team while hanging off
-- another team's analysis, and file references go through (analysis, file) so
-- a row can't point into a different analysis.

-- Clerk owns organizations; this row exists so that everything below can hang
-- off a real foreign key, and deleting it deletes all of the team's data.
create table public.organizations (
  id text primary key check (id like 'org\_%'),
  created_at timestamptz not null default now()
);

-- One public GitHub repository a team has added.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  repository text not null check (repository ~ '^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$'),
  created_at timestamptz not null default now(),
  unique (organization_id, repository),
  unique (organization_id, id)
);

-- One parse of a project at one commit.
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  status public.analysis_status not null default 'queued',
  commit_sha text check (commit_sha ~ '^[0-9a-f]{40}$'),
  -- A failure always says why; nothing else carries a reason.
  failure_reason text,
  created_at timestamptz not null default now(),
  check ((status = 'failed') = (failure_reason is not null)),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  unique (organization_id, id)
);

-- Every file the analysis saw. A skipped file is still a row, with the reason,
-- so coverage is counted rather than inferred from what's missing.
create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  skip_reason text,
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id) on delete cascade,
  unique (analysis_id, path),
  unique (analysis_id, id)
);

-- Only resolved imports: both ends are real files in the same analysis.
create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  kind public.import_kind not null,
  specifier text not null,
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id) on delete cascade,
  foreign key (analysis_id, source_file_id)
    references public.files (analysis_id, id) on delete cascade,
  foreign key (analysis_id, target_file_id)
    references public.files (analysis_id, id) on delete cascade
);

-- A route is stored only when both its method and full path were recovered.
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null,
  path text not null,
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id) on delete cascade,
  foreign key (analysis_id, file_id)
    references public.files (analysis_id, id) on delete cascade
);

-- The AI's explanation of one file.
create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  body text not null,
  model text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id) on delete cascade,
  foreign key (analysis_id, file_id)
    references public.files (analysis_id, id) on delete cascade,
  unique (analysis_id, file_id)
);

-- What sort of thing a file is, and whether convention or the AI said so.
create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  role text not null,
  source public.file_role_source not null,
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id) on delete cascade,
  foreign key (analysis_id, file_id)
    references public.files (analysis_id, id) on delete cascade,
  unique (analysis_id, file_id)
);

-- AI-written observations about an analysis as a whole.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  body text not null,
  model text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Each leads with the foreign key's columns in the same order, so one index
-- serves the policy filter, the parent lookup and the cascade. Unique
-- constraints above already cover the rest.
create index analyses_organization_project_idx on public.analyses (organization_id, project_id);
create index analyses_organization_created_idx on public.analyses (organization_id, created_at desc);
create index files_organization_analysis_idx on public.files (organization_id, analysis_id);
create index edges_organization_analysis_idx on public.edges (organization_id, analysis_id);
create index edges_source_file_idx on public.edges (analysis_id, source_file_id);
create index edges_target_file_idx on public.edges (analysis_id, target_file_id);
create index routes_organization_analysis_idx on public.routes (organization_id, analysis_id);
create index routes_file_idx on public.routes (analysis_id, file_id);
create index explanations_organization_analysis_idx on public.explanations (organization_id, analysis_id);
create index file_roles_organization_analysis_idx on public.file_roles (organization_id, analysis_id);
create index insights_organization_analysis_idx on public.insights (organization_id, analysis_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Signed-in members can read; nothing can write through the API yet, because
-- nothing in the app writes yet. Anonymous requests get no table at all.
revoke all on table
  public.organizations, public.projects, public.analyses, public.files,
  public.edges, public.routes, public.explanations, public.file_roles,
  public.insights
from anon, authenticated;

grant select on table
  public.organizations, public.projects, public.analyses, public.files,
  public.edges, public.routes, public.explanations, public.file_roles,
  public.insights
to authenticated;

create policy "Members read their organization"
  on public.organizations for select to authenticated
  using (id = (select private.organization_id()));

create policy "Members read their organization's projects"
  on public.projects for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members read their organization's analyses"
  on public.analyses for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members read their organization's files"
  on public.files for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members read their organization's edges"
  on public.edges for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members read their organization's routes"
  on public.routes for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members read their organization's explanations"
  on public.explanations for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members read their organization's file roles"
  on public.file_roles for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members read their organization's insights"
  on public.insights for select to authenticated
  using (organization_id = (select private.organization_id()));
