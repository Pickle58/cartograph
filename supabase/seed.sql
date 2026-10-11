-- Rows for the dashboard until something in the app creates real ones. Run as
-- the database owner (SQL editor or MCP), which bypasses RLS; safe to re-run.
--
-- Organization IDs are real Clerk organizations so the policies have something
-- to match. `org_seed_outsider` belongs to nobody: its rows exist in the table
-- and must never appear on anyone's dashboard.

insert into public.organizations (id) values
  ('org_3KWKVANzvI7i4q9EmHbwVStUn0s'),  -- James's Organization
  ('org_3KWnAO99dMOIOim3LG24QSRr5TL'),  -- Demo
  ('org_seed_outsider')
on conflict (id) do nothing;

insert into public.projects (id, organization_id, repository) values
  ('00000000-0000-4000-8000-000000000101', 'org_3KWKVANzvI7i4q9EmHbwVStUn0s', 'seed/james-web'),
  ('00000000-0000-4000-8000-000000000102', 'org_3KWKVANzvI7i4q9EmHbwVStUn0s', 'seed/james-api'),
  ('00000000-0000-4000-8000-000000000201', 'org_3KWnAO99dMOIOim3LG24QSRr5TL', 'seed/demo-dashboard'),
  ('00000000-0000-4000-8000-000000000901', 'org_seed_outsider', 'seed/outsider-app')
on conflict (id) do nothing;

insert into public.analyses (id, organization_id, project_id, status, commit_sha, failure_reason, created_at) values
  ('00000000-0000-4000-8000-000000001101', 'org_3KWKVANzvI7i4q9EmHbwVStUn0s', '00000000-0000-4000-8000-000000000101',
    'complete', '1111111111111111111111111111111111111111', null, now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000001102', 'org_3KWKVANzvI7i4q9EmHbwVStUn0s', '00000000-0000-4000-8000-000000000101',
    'running', '2222222222222222222222222222222222222222', null, now() - interval '10 minutes'),
  ('00000000-0000-4000-8000-000000001103', 'org_3KWKVANzvI7i4q9EmHbwVStUn0s', '00000000-0000-4000-8000-000000000102',
    'failed', null, 'Repository not found or not public', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000001104', 'org_3KWKVANzvI7i4q9EmHbwVStUn0s', '00000000-0000-4000-8000-000000000102',
    'queued', null, null, now() - interval '1 minute'),
  ('00000000-0000-4000-8000-000000002101', 'org_3KWnAO99dMOIOim3LG24QSRr5TL', '00000000-0000-4000-8000-000000000201',
    'complete', '3333333333333333333333333333333333333333', null, now() - interval '5 hours'),
  ('00000000-0000-4000-8000-000000002102', 'org_3KWnAO99dMOIOim3LG24QSRr5TL', '00000000-0000-4000-8000-000000000201',
    'failed', null, 'Repository not found or not public', now() - interval '30 minutes'),
  ('00000000-0000-4000-8000-000000009101', 'org_seed_outsider', '00000000-0000-4000-8000-000000000901',
    'complete', '9999999999999999999999999999999999999999', null, now() - interval '3 hours')
on conflict (id) do nothing;
