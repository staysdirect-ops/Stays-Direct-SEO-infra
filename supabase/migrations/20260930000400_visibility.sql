-- AI visibility tracker.

create table public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_text text not null unique,
  category text not null default 'general' check (category in ('location', 'project', 'general', 'cost')),
  town_id uuid references public.towns (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ai_prompts enable row level security;
create policy ai_prompts_select on public.ai_prompts for select to authenticated using (public.is_staff());
create policy ai_prompts_write on public.ai_prompts for all to authenticated
  using (public.has_role(array['editor'])) with check (public.has_role(array['editor']));

create table public.ai_visibility_checks (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  run_id bigint references public.job_runs (id) on delete set null,
  prompt_id uuid not null references public.ai_prompts (id) on delete cascade,
  engine text not null check (engine in ('chatgpt', 'claude', 'perplexity')),
  model text not null,
  response_text text,
  cited_urls text[] not null default '{}',
  brand_mentioned boolean not null default false,
  brand_position integer,
  brand_cited_url text,
  competitors_mentioned text[] not null default '{}',
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  error text
);
alter table public.ai_visibility_checks enable row level security;
create index ai_visibility_checks_run_idx on public.ai_visibility_checks (run_at desc);
create index ai_visibility_checks_prompt_idx on public.ai_visibility_checks (prompt_id, engine, run_at desc);
create policy ai_visibility_checks_select on public.ai_visibility_checks for select to authenticated using (public.is_staff());
