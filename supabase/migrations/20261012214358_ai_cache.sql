-- Explanations remember the file bytes they were written from. The cache is
-- keyed by that content and the pinned model, so a second call reads the row
-- and does not call the model. Re-pinning the model leaves the other model's
-- rows in place.

alter table public.explanations
  add column content_hash text not null;

alter table public.explanations
  add constraint explanations_content_hash_sha256
  check (content_hash ~ '^[0-9a-f]{64}$');

create type public.ai_cache_kind as enum (
  'file-explanation',
  'folder-explanation',
  'file-role'
);

create table public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  kind public.ai_cache_kind not null,
  model text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  body text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, kind, model, content_hash)
);

alter table public.ai_cache enable row level security;

revoke all on table public.ai_cache from anon, authenticated;

grant select, insert on table public.ai_cache to authenticated;

create policy "Members read their organization's AI cache"
  on public.ai_cache for select to authenticated
  using (organization_id = (select private.organization_id()));

create policy "Members insert their organization's AI cache"
  on public.ai_cache for insert to authenticated
  with check (organization_id = (select private.organization_id()));

grant insert, update on table public.explanations to authenticated;

create policy "Members insert their organization's explanations"
  on public.explanations for insert to authenticated
  with check (organization_id = (select private.organization_id()));

create policy "Members update their organization's explanations"
  on public.explanations for update to authenticated
  using (organization_id = (select private.organization_id()))
  with check (organization_id = (select private.organization_id()));

-- Re-analyse replaces the one stored parse of a repository.
grant delete on table public.analyses to authenticated;

create policy "Members delete their organization's analyses"
  on public.analyses for delete to authenticated
  using (organization_id = (select private.organization_id()));
