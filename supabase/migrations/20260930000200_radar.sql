-- Project Radar: awarded contracts, property matches and leads.

create table public.radar_projects (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('contracts_finder', 'find_a_tender', 'manual')),
  source_id text not null unique,
  ocid text,
  source_url text,
  title text not null,
  description text,
  buyer_name text,
  buyer_postcode text,
  supplier_name text,
  supplier_companies_house_number text,
  supplier_address text,
  supplier_website text,
  cpv_codes text[] not null default '{}',
  value_gbp numeric,
  award_date date,
  start_date date,
  end_date date,
  duration_months integer,
  delivery_text text,
  delivery_postcodes text[] not null default '{}',
  dedupe_key text,
  site_location_text text,
  site_postcode text,
  site_town text,
  site_location extensions.geography(point, 4326),
  site_lat double precision generated always as (extensions.st_y(site_location::extensions.geometry)) stored,
  site_lng double precision generated always as (extensions.st_x(site_location::extensions.geometry)) stored,
  location_confidence text check (location_confidence in ('high', 'medium', 'low')),
  geocode_method text,
  is_relevant boolean,
  relevance_reason text,
  est_workers_min integer,
  est_workers_max integer,
  est_workers_away_from_home integer,
  project_type text check (project_type in ('rail', 'road', 'energy', 'nuclear', 'water', 'data_centre', 'defence', 'housing', 'commercial', 'education', 'health', 'other')),
  status text not null default 'new' check (status in ('new', 'qualified', 'rejected', 'needs_review', 'lead_created')),
  score integer,
  score_breakdown jsonb,
  enriched_at timestamptz,
  matched_at timestamptz,
  enrich_error text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.radar_projects enable row level security;
create index radar_projects_status_idx on public.radar_projects (status, created_at desc);
create index radar_projects_ocid_idx on public.radar_projects (ocid);
create index radar_projects_dedupe_idx on public.radar_projects (dedupe_key);
create index radar_projects_location_idx on public.radar_projects using gist (site_location);

create trigger radar_projects_touch before update on public.radar_projects
  for each row execute function public.touch_updated_at();

create policy radar_projects_select on public.radar_projects for select to authenticated using (public.has_role(array['sales', 'editor']));
create policy radar_projects_write on public.radar_projects for all to authenticated
  using (public.has_role(array['sales'])) with check (public.has_role(array['sales']));

create table public.radar_matches (
  project_id uuid not null references public.radar_projects (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  distance_miles numeric(6, 2) not null,
  created_at timestamptz not null default now(),
  primary key (project_id, property_id)
);
alter table public.radar_matches enable row level security;
create index radar_matches_property_idx on public.radar_matches (property_id);
create policy radar_matches_select on public.radar_matches for select to authenticated using (public.has_role(array['sales']));
create policy radar_matches_write on public.radar_matches for all to authenticated
  using (public.has_role(array['sales'])) with check (public.has_role(array['sales']));

-- Properties available now, or free by start_date + 30 days, within radius of a project site.
create or replace function public.match_properties(p_project_id uuid, p_radius_miles numeric)
returns table (property_id uuid, distance_miles numeric)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select pr.id, round((st_distance(pr.location, rp.site_location) / 1609.344)::numeric, 2)
  from public.radar_projects rp
  join public.properties pr on pr.location is not null
  where rp.id = p_project_id
    and rp.site_location is not null
    and pr.status <> 'offline'
    and (
      pr.status = 'available'
      or (pr.available_from is not null and pr.available_from <= coalesce(rp.start_date, current_date) + 30)
    )
    and st_dwithin(pr.location, rp.site_location, p_radius_miles * 1609.344)
  order by 2;
$$;
revoke execute on function public.match_properties(uuid, numeric) from public, anon;
grant execute on function public.match_properties(uuid, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leads (read by the separate Lovable leads app; see docs/LEADS_CONTRACT.md)
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null check (source in ('radar', 'seo_form', 'calculator', 'manual')),
  company_name text,
  companies_house_number text,
  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  company_website text,
  project_id uuid references public.radar_projects (id) on delete set null,
  project_title text,
  site_town text,
  site_postcode text,
  est_workers integer,
  start_date date,
  value_gbp numeric,
  matched_property_ids uuid[] not null default '{}',
  nearest_property_miles numeric(6, 2),
  outreach_subject text,
  outreach_body text,
  linkedin_message text,
  call_script text,
  score integer check (score between 0 and 100),
  flags text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'researching', 'ready', 'contacted', 'replied', 'quoted', 'won', 'lost', 'do_not_contact')),
  owner uuid references auth.users (id) on delete set null,
  notes text,
  landing_page text,
  utm jsonb,
  synced_at timestamptz,
  ip_hash text
);
alter table public.leads enable row level security;
create index leads_status_idx on public.leads (status, created_at desc);
create index leads_source_idx on public.leads (source);
create unique index leads_one_per_radar_project on public.leads (project_id) where source = 'radar' and project_id is not null;
create index leads_company_idx on public.leads (lower(company_name));
create index leads_ch_idx on public.leads (companies_house_number);

create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

create policy leads_select on public.leads for select to authenticated using (public.has_role(array['sales']));
create policy leads_write on public.leads for all to authenticated
  using (public.has_role(array['sales'])) with check (public.has_role(array['sales']));

-- Stable export contract. security_invoker keeps the caller's RLS in force.
create view public.leads_export with (security_invoker = true) as
select
  id,
  created_at,
  updated_at,
  source,
  company_name,
  companies_house_number,
  contact_name,
  contact_role,
  contact_email,
  contact_phone,
  company_website,
  project_id,
  project_title,
  site_town,
  site_postcode,
  est_workers,
  start_date,
  value_gbp,
  matched_property_ids,
  nearest_property_miles,
  outreach_subject,
  outreach_body,
  linkedin_message,
  call_script,
  score,
  flags,
  status,
  owner,
  notes,
  landing_page,
  utm,
  synced_at
from public.leads;

-- A company that said "no thanks" is suppressed from future Radar leads.
create or replace function public.is_company_suppressed(p_companies_house_number text, p_company_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.status = 'do_not_contact'
      and (
        (p_companies_house_number is not null and l.companies_house_number = p_companies_house_number)
        or (p_company_name is not null and lower(trim(l.company_name)) = lower(trim(p_company_name)))
      )
  );
$$;
grant execute on function public.is_company_suppressed(text, text) to authenticated, service_role;

-- POST the export row to LEADS_WEBHOOK_URL (vault secret leads_webhook_url) on insert and status change.
create or replace function private.notify_lead_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := private.secret('leads_webhook_url');
  payload jsonb;
begin
  if url is null or url = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  select to_jsonb(e) into payload from public.leads_export e where e.id = new.id;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-StaysDirect-Event', lower(tg_op)),
    body := jsonb_build_object(
      'event', case when tg_op = 'INSERT' then 'lead.created' else 'lead.status_changed' end,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'lead', coalesce(payload, to_jsonb(new) - 'ip_hash')
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

create trigger leads_webhook after insert or update of status on public.leads
  for each row execute function private.notify_lead_webhook();

-- Realtime for the Lovable app, when the publication exists (it does on Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.leads;
  end if;
end;
$$;

-- Simple fixed-window rate limiter for the public lead endpoint.
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table private.rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into private.rate_limits as r (key, window_start, hits) values (p_key, win, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  delete from private.rate_limits where window_start < now() - interval '1 day';
  return n <= p_max;
end;
$$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
