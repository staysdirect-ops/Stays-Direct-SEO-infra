-- Foundation: extensions, roles, settings, properties, towns, usage and job logging.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null check (role in ('admin', 'sales', 'editor')),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- SECURITY DEFINER so policies can check roles without recursing through admin_users' own RLS.
create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
      and (au.role = 'admin' or au.role = any (roles))
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users au where au.user_id = auth.uid());
$$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.admin_users where user_id = auth.uid();
$$;

grant execute on function public.has_role(text[]), public.is_staff(), public.my_role() to authenticated;

create policy admin_users_select on public.admin_users
  for select to authenticated using (user_id = auth.uid() or public.has_role(array['admin']));
create policy admin_users_admin_write on public.admin_users
  for all to authenticated using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Secrets live in Supabase Vault: project_url, cron_secret, leads_webhook_url (optional).
create or replace function private.secret(secret_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

-- Fire-and-forget POST to an edge function, authenticated with the cron secret.
create or replace function private.call_function(fn text, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := private.secret('project_url');
  secret text := private.secret('cron_secret');
  request_id bigint;
begin
  if base is null or secret is null then
    raise warning 'call_function(%): vault secrets project_url/cron_secret are not set', fn;
    return null;
  end if;
  select net.http_post(
    url := rtrim(base, '/') || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := body,
    timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.call_function(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  brand_voice text not null default 'Direct, practical, no fluff. Written for busy site and project managers. British English. Plain numbers, pppn pricing, bills included, same-day quotes, 24/7 UK support. Never hype. Never invent facts.',
  company_facts jsonb not null default '{}'::jsonb,
  claude_model text not null default 'claude-sonnet-5-5',
  claude_cheap_model text not null default 'claude-haiku-4-5',
  openai_model text not null default 'gpt-5',
  perplexity_model text not null default 'sonar',
  radar_min_value_gbp numeric not null default 500000,
  radar_match_radius_miles numeric not null default 25,
  radar_cpv_prefixes text[] not null default array['45', '71', '50', '51', '65', '76'],
  seo_pages_per_day integer not null default 5,
  blog_posts_per_week integer not null default 3,
  daily_ai_spend_cap_usd numeric not null default 10,
  tracked_brand_names text[] not null default array['StaysDirect', 'Stays Direct', 'staysdirect.co.uk'],
  competitor_names text[] not null default array['Overnightly', 'Comfy Workers', 'Contractors Den', 'Rentastay', 'Offer2Stay', 'On Site Stays', 'Trade Rentals'],
  crons_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
insert into public.settings (id) values (1) on conflict do nothing;

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

create policy settings_select on public.settings for select to authenticated using (public.is_staff());
create policy settings_update on public.settings for update to authenticated
  using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  town text not null,
  postcode text not null,
  location extensions.geography(point, 4326),
  lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
  bedrooms integer not null check (bedrooms between 1 and 30),
  max_guests integer not null check (max_guests between 1 and 60),
  parking_spaces integer not null default 0 check (parking_spaces >= 0),
  van_parking boolean not null default false,
  pppn_from numeric(8, 2) not null check (pppn_from > 0),
  available_from date,
  status text not null default 'available' check (status in ('available', 'occupied', 'offline')),
  photos jsonb not null default '[]'::jsonb,
  notes text,
  geocode_status text not null default 'pending' check (geocode_status in ('pending', 'ok', 'failed', 'manual')),
  geocoded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.properties enable row level security;
create index properties_location_idx on public.properties using gist (location);
create index properties_status_idx on public.properties (status);

create trigger properties_touch before update on public.properties
  for each row execute function public.touch_updated_at();

create policy properties_select on public.properties for select to authenticated using (public.is_staff());
create policy properties_insert on public.properties for insert to authenticated with check (public.has_role(array['sales']));
create policy properties_update on public.properties for update to authenticated
  using (public.has_role(array['sales'])) with check (public.has_role(array['sales']));
create policy properties_delete on public.properties for delete to authenticated using (public.has_role(array['sales']));

-- ---------------------------------------------------------------------------
-- Towns
-- ---------------------------------------------------------------------------
create table public.towns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  county text,
  region text,
  location extensions.geography(point, 4326),
  lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
  population integer,
  is_active boolean not null default true,
  avg_hotel_pppn numeric(8, 2),
  notes text,
  geocode_status text not null default 'pending' check (geocode_status in ('pending', 'ok', 'failed', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.towns enable row level security;
create index towns_location_idx on public.towns using gist (location);

create trigger towns_touch before update on public.towns
  for each row execute function public.touch_updated_at();

create policy towns_select on public.towns for select to authenticated using (public.is_staff());
create policy towns_write on public.towns for all to authenticated
  using (public.has_role(array['editor'])) with check (public.has_role(array['editor']));

-- Geocode new or changed properties/towns via the geocode edge function (postcodes.io).
-- Rows inserted with coordinates are treated as manually located.
create or replace function private.queue_geocode_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.location is not null then
    if new.geocode_status = 'pending' then
      new.geocode_status := 'manual';
    end if;
  elsif tg_op = 'UPDATE' and new.location is distinct from old.location then
    -- The geocoder sets its own status alongside the location; anything else is a manual edit.
    if new.geocode_status is not distinct from old.geocode_status then
      new.geocode_status := 'manual';
    end if;
  elsif tg_op = 'INSERT' or new.postcode is distinct from old.postcode or new.town is distinct from old.town then
    new.geocode_status := 'pending';
    perform private.call_function('geocode', jsonb_build_object('table', 'properties', 'id', new.id));
  end if;
  return new;
end;
$$;

create or replace function private.queue_geocode_town()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location is not null then
    if tg_op = 'INSERT' or (new.location is distinct from old.location and new.geocode_status is not distinct from old.geocode_status) then
      new.geocode_status := 'manual';
    end if;
  elsif tg_op = 'INSERT' or new.name is distinct from old.name then
    new.geocode_status := 'pending';
    perform private.call_function('geocode', jsonb_build_object('table', 'towns', 'id', new.id));
  end if;
  return new;
end;
$$;

create trigger properties_geocode before insert or update on public.properties
  for each row execute function private.queue_geocode_property();
create trigger towns_geocode before insert or update on public.towns
  for each row execute function private.queue_geocode_town();

-- ---------------------------------------------------------------------------
-- AI usage and job logging
-- ---------------------------------------------------------------------------
create table public.api_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('anthropic', 'openai', 'perplexity')),
  model text not null,
  function_name text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  tokens integer generated always as (input_tokens + output_tokens) stored,
  est_cost_usd numeric(12, 6) not null default 0
);
alter table public.api_usage enable row level security;
create index api_usage_created_idx on public.api_usage (created_at desc);
create policy api_usage_select on public.api_usage for select to authenticated using (public.has_role(array['admin']));

-- Today's spend in UK local days, used for the daily cap.
create or replace function public.ai_spend_today_usd()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(est_cost_usd), 0)
  from public.api_usage
  where created_at >= (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London');
$$;

create table public.job_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  items_processed integer not null default 0,
  error text,
  details jsonb not null default '{}'::jsonb
);
alter table public.job_runs enable row level security;
create index job_runs_name_started_idx on public.job_runs (job_name, started_at desc);
create policy job_runs_select on public.job_runs for select to authenticated using (public.is_staff());
