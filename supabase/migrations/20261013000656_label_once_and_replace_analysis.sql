-- Labelling runs once. The attempt is stored even when it fails or leaves
-- files unidentified, so a later page view does not download the repository
-- again. A null note means the attempt had nothing to tell the user.

alter table public.analyses
  add column labeling_attempted boolean not null default false,
  add column labeling_note text;

alter table public.analyses
  add constraint analyses_labeling_note_requires_attempt
  check (labeling_note is null or labeling_attempted);

-- Re-analyse swaps the stored parse in one transaction. The unique
-- (organization_id, project_id) constraint means the old row has to go before
-- the new one can exist; if the insert fails, this function aborts and the
-- delete rolls back with it. A running row is refused so an in-flight run
-- cannot keep writing under an id that was just deleted.
--
-- Invoker, not definer: row-level security still decides which analysis a
-- member can replace.

create function public.replace_analysis(target_id uuid, next_stage_message text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_status public.analysis_status;
  existing_org text;
  existing_project uuid;
  new_id uuid;
begin
  select status, organization_id, project_id
  into existing_status, existing_org, existing_project
  from public.analyses
  where id = target_id
  for update;

  if not found then
    raise exception 'Analysis not found.' using errcode = 'P0002';
  end if;

  if existing_status in (
    'queued'::public.analysis_status,
    'running'::public.analysis_status
  ) then
    raise exception 'This analysis is still running.' using errcode = 'P0001';
  end if;

  delete from public.analyses where id = target_id;

  insert into public.analyses (
    organization_id,
    project_id,
    status,
    stage,
    stage_message
  ) values (
    existing_org,
    existing_project,
    'running'::public.analysis_status,
    'fetch'::public.analysis_stage,
    next_stage_message
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.replace_analysis(uuid, text) from public;
revoke all on function public.replace_analysis(uuid, text) from anon;
grant execute on function public.replace_analysis(uuid, text) to authenticated;
