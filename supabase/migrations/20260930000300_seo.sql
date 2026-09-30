-- SEO + AI search content engine.

create table public.seo_pages (
  id uuid primary key default gen_random_uuid(),
  page_type text not null check (page_type in ('location', 'project')),
  slug text not null unique,
  town_id uuid references public.towns (id) on delete set null,
  project_id uuid references public.radar_projects (id) on delete set null,
  project_name text,
  project_location_text text,
  project_town text,
  project_location extensions.geography(point, 4326),
  project_lat double precision generated always as (extensions.st_y(project_location::extensions.geometry)) stored,
  project_lng double precision generated always as (extensions.st_x(project_location::extensions.geometry)) stored,
  title text check (char_length(title) <= 70),
  meta_description text,
  h1 text,
  intro text,
  sections jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  key_facts jsonb not null default '[]'::jsonb,
  schema_jsonld jsonb,
  internal_links jsonb not null default '[]'::jsonb,
  word_count integer,
  status text not null default 'queued' check (status in ('queued', 'generating', 'draft', 'in_review', 'approved', 'published', 'needs_refresh')),
  priority integer not null default 0,
  quality_score integer,
  quality_notes text[] not null default '{}',
  data_pack jsonb,
  data_pack_hash text,
  search_text text,
  generation_error text,
  generated_at timestamptz,
  -- What the public endpoints serve. Only replaced on publish, so regenerating never changes live copy.
  published_snapshot jsonb,
  published_at timestamptz,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_pages_type_ref check (
    (page_type = 'location' and town_id is not null)
    or (page_type = 'project' and project_name is not null)
  ),
  constraint seo_pages_project_slug check (page_type <> 'project' or slug like 'projects/%')
);
alter table public.seo_pages enable row level security;
create index seo_pages_status_idx on public.seo_pages (status, priority desc);
create unique index seo_pages_one_per_town on public.seo_pages (town_id) where page_type = 'location';
create index seo_pages_search_trgm on public.seo_pages using gin (search_text extensions.gin_trgm_ops);

create trigger seo_pages_touch before update on public.seo_pages
  for each row execute function public.touch_updated_at();

create policy seo_pages_select on public.seo_pages for select to authenticated using (public.is_staff());
create policy seo_pages_write on public.seo_pages for all to authenticated
  using (public.has_role(array['editor'])) with check (public.has_role(array['editor']));

create table public.blog_topics (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  working_title text not null,
  intent text,
  source text not null default 'ai',
  priority integer not null default 3 check (priority between 1 and 5),
  status text not null default 'idea' check (status in ('idea', 'queued', 'generating', 'written', 'rejected')),
  project_id uuid references public.radar_projects (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_topics enable row level security;
create index blog_topics_status_idx on public.blog_topics (status, priority desc, created_at);
create trigger blog_topics_touch before update on public.blog_topics
  for each row execute function public.touch_updated_at();
create policy blog_topics_select on public.blog_topics for select to authenticated using (public.is_staff());
create policy blog_topics_write on public.blog_topics for all to authenticated
  using (public.has_role(array['editor'])) with check (public.has_role(array['editor']));

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.blog_topics (id) on delete set null,
  slug text not null unique,
  title text not null,
  meta_description text,
  excerpt text,
  body_markdown text not null default '',
  faqs jsonb not null default '[]'::jsonb,
  schema_jsonld jsonb,
  internal_links jsonb not null default '[]'::jsonb,
  word_count integer,
  status text not null default 'draft' check (status in ('queued', 'generating', 'draft', 'in_review', 'approved', 'published', 'needs_refresh')),
  quality_score integer,
  quality_notes text[] not null default '{}',
  search_text text,
  generation_error text,
  published_snapshot jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_posts enable row level security;
create index blog_posts_status_idx on public.blog_posts (status);
create index blog_posts_search_trgm on public.blog_posts using gin (search_text extensions.gin_trgm_ops);
create trigger blog_posts_touch before update on public.blog_posts
  for each row execute function public.touch_updated_at();
create policy blog_posts_select on public.blog_posts for select to authenticated using (public.is_staff());
create policy blog_posts_write on public.blog_posts for all to authenticated
  using (public.has_role(array['editor'])) with check (public.has_role(array['editor']));

-- The 20 most similar pieces of the same kind (pages vs pages, posts vs posts) by trigram similarity.
create or replace function public.seo_similar_pages(p_text text, p_exclude_id uuid default null, p_limit integer default 20, p_kind text default 'page')
returns table (id uuid, slug text, kind text, similarity real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select * from (
    select s.id, s.slug, s.page_type as kind, similarity(s.search_text, p_text) as similarity
    from public.seo_pages s
    where p_kind = 'page' and s.search_text is not null and s.id is distinct from p_exclude_id
    union all
    select b.id, b.slug, 'blog', similarity(b.search_text, p_text)
    from public.blog_posts b
    where p_kind = 'blog' and b.search_text is not null and b.id is distinct from p_exclude_id
  ) x
  order by similarity desc
  limit p_limit;
$$;
revoke execute on function public.seo_similar_pages(text, uuid, integer, text) from public, anon;
grant execute on function public.seo_similar_pages(text, uuid, integer, text) to authenticated, service_role;

-- Live content index used by public-content, public-sitemap and public-llms-txt.
create view public.published_content with (security_invoker = true) as
select s.page_type as kind, s.slug, s.published_snapshot ->> 'title' as title, s.published_snapshot ->> 'meta_description' as meta_description,
       coalesce(s.last_refreshed_at, s.published_at) as updated_at,
       coalesce(t.lat, s.project_lat) as lat, coalesce(t.lng, s.project_lng) as lng,
       coalesce(t.name, s.project_name) as name
from public.seo_pages s
left join public.towns t on t.id = s.town_id
where s.published_snapshot is not null
union all
select 'blog', b.slug, b.published_snapshot ->> 'title', b.published_snapshot ->> 'meta_description', b.published_at, null, null, b.published_snapshot ->> 'title'
from public.blog_posts b
where b.published_snapshot is not null;
