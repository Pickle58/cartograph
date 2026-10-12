-- Astro is a framework the parser can name. Existing rows stay valid.

alter table public.analyses drop constraint analyses_framework_known;

alter table public.analyses
  add constraint analyses_framework_known
  check (framework in ('nextjs', 'nestjs', 'react', 'express', 'astro', 'none'));
