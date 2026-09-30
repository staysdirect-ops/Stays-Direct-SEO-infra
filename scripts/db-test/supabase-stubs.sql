-- Minimal stand-ins for what a Supabase project provides, so migrations can be tested on plain Postgres.
-- Not applied to Supabase itself.

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists vault;
create schema if not exists net;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema public, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table vault.secrets (name text primary key, secret text not null);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;

-- pg_net stand-in: records requests instead of sending them.
create table net.requests (
  id bigserial primary key,
  url text,
  headers jsonb,
  body jsonb,
  created_at timestamptz default now()
);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$
  insert into net.requests (url, headers, body) values (url, headers, body) returning id
$$;

-- Storage stand-in: just the tables policies are written against.
create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid default auth.uid(),
  metadata jsonb
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create publication supabase_realtime;
