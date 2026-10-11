-- Real Clerk organizations. The pipeline upserts these on first run; keeping
-- them here means a fresh database has the teams before anyone pastes a URL.
-- Safe to re-run.

insert into public.organizations (id) values
  ('org_3KWKVANzvI7i4q9EmHbwVStUn0s'),  -- James's Organization
  ('org_3KWnAO99dMOIOim3LG24QSRr5TL')   -- Demo
on conflict (id) do nothing;
