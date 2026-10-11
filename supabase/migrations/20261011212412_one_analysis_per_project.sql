-- Seed rows were dashboard fixtures. Analyses are stored for real now, and
-- two rows per repository would violate the rule this constraint enforces.

delete from public.projects
where repository like 'seed/%';

delete from public.organizations
where id = 'org_seed_outsider';

alter table public.analyses
  add constraint analyses_organization_id_project_id_key
  unique (organization_id, project_id);
