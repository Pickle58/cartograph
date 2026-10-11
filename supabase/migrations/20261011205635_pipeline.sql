-- Stages, write access for the run, and a private per-analysis progress channel.
-- The channel pattern is `analysis:<id>`. It is declared here as the publish
-- topic and as the subscribe policy, because an unregistered private channel
-- accepts publishes with no error and nowhere to go.

-- ---------------------------------------------------------------------------
-- Columns the run writes
-- ---------------------------------------------------------------------------

create type public.analysis_stage as enum ('fetch', 'select', 'parse', 'store');

alter table public.analyses
  add column stage public.analysis_stage,
  add column stage_message text,
  add column updated_at timestamptz not null default now();

alter table public.files
  add column lines integer;

alter table public.files
  add constraint files_lines_match_skip
  check (
    (skip_reason is null) = (lines is not null)
    and (lines is null or lines >= 0)
    and (skip_reason is null or length(skip_reason) > 0)
  );

-- ---------------------------------------------------------------------------
-- Progress: publish from our table, never from realtime.messages
-- ---------------------------------------------------------------------------

create function private.touch_analysis_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger analyses_touch_updated_at
  before update on public.analyses
  for each row
  execute function private.touch_analysis_updated_at();

create function private.publish_analysis_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Payload is what the progress page shows. Status is the terminal signal
  -- (complete / failed) so the page does not have to read the rest of the row.
  perform realtime.send(
    jsonb_build_object(
      'stage', new.stage,
      'message', new.stage_message,
      'status', new.status
    ),
    'progress',
    'analysis:' || new.id::text,
    true
  );
  return new;
end;
$$;

revoke all on function private.touch_analysis_updated_at() from public;
revoke all on function private.publish_analysis_progress() from public;

create trigger analyses_publish_progress
  after insert or update of stage, stage_message, status on public.analyses
  for each row
  execute function private.publish_analysis_progress();

-- Members may subscribe to an analysis channel only when they may read that
-- analysis. They cannot publish: there is no insert policy for them here,
-- and the trigger above runs as the function owner.
create policy "Members subscribe to their organization's analysis progress"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.analyses
      where (select realtime.topic()) = 'analysis:' || analyses.id::text
        and analyses.organization_id = (select private.organization_id())
    )
  );

-- ---------------------------------------------------------------------------
-- Writes: the signed-in member's token, scoped by the same organization claim
-- ---------------------------------------------------------------------------

grant insert on table public.organizations to authenticated;
grant insert on table public.projects to authenticated;
grant insert, update on table public.analyses to authenticated;
grant insert on table public.files to authenticated;
grant insert on table public.edges to authenticated;

create policy "Members insert their organization"
  on public.organizations for insert to authenticated
  with check (id = (select private.organization_id()));

create policy "Members insert their organization's projects"
  on public.projects for insert to authenticated
  with check (organization_id = (select private.organization_id()));

create policy "Members insert their organization's analyses"
  on public.analyses for insert to authenticated
  with check (organization_id = (select private.organization_id()));

create policy "Members update their organization's analyses"
  on public.analyses for update to authenticated
  using (organization_id = (select private.organization_id()))
  with check (organization_id = (select private.organization_id()));

create policy "Members insert their organization's files"
  on public.files for insert to authenticated
  with check (organization_id = (select private.organization_id()));

create policy "Members insert their organization's edges"
  on public.edges for insert to authenticated
  with check (organization_id = (select private.organization_id()));
