-- Assertions run against a database built from supabase/migrations. Any failure raises.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- 1. RLS is enabled on every table in public and private.
do $$
declare missing text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public', 'private') and not c.relrowsecurity
    and c.relname <> 'spatial_ref_sys';
  if missing is not null then raise exception 'RLS disabled on: %', missing; end if;
end $$;

-- 2. Reference data.
do $$
begin
  if (select count(*) from public.towns) < 150 then raise exception 'expected 150+ towns'; end if;
  if (select count(*) from public.towns where lat is null) > 0 then raise exception 'towns missing coordinates'; end if;
  if (select count(*) from public.ai_prompts) <> 40 then raise exception 'expected 40 prompts, got %', (select count(*) from public.ai_prompts); end if;
  if (select count(*) from public.seo_pages where page_type = 'project') <> 14 then raise exception 'expected 14 seeded project pages'; end if;
  if (select count(*) from public.settings) <> 1 then raise exception 'settings must have one row'; end if;
  if (select count(*) from cron.job) <> 7 then raise exception 'expected 7 cron jobs, got %', (select count(*) from cron.job); end if;
end $$;

-- 3. Fixtures: users per role, properties, a project.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('00000000-0000-0000-0000-00000000000b', 'sales@test'),
  ('00000000-0000-0000-0000-00000000000c', 'editor@test'),
  ('00000000-0000-0000-0000-00000000000d', 'nobody@test');
insert into public.admin_users (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'sales@test', 'sales'),
  ('00000000-0000-0000-0000-00000000000c', 'editor@test', 'editor');

insert into vault.secrets values ('project_url', 'https://proj.supabase.co'), ('cron_secret', 'test-secret');

insert into public.properties (id, name, town, postcode, bedrooms, max_guests, pppn_from, status, available_from, location) values
  ('10000000-0000-0000-0000-000000000001', 'Near', 'Cannington', 'TA5 2LD', 6, 6, 29.5, 'available', null, extensions.st_setsrid(extensions.st_makepoint(-3.0647, 51.1497), 4326)::extensions.geography),
  ('10000000-0000-0000-0000-000000000002', 'Soon free', 'Bridgwater', 'TA6 3AA', 5, 5, 32, 'occupied', '2026-11-20', extensions.st_setsrid(extensions.st_makepoint(-3.0152, 51.1352), 4326)::extensions.geography),
  ('10000000-0000-0000-0000-000000000003', 'Busy', 'Bridgwater', 'TA6 4BB', 5, 5, 32, 'occupied', '2027-06-01', extensions.st_setsrid(extensions.st_makepoint(-3.0100, 51.1300), 4326)::extensions.geography),
  ('10000000-0000-0000-0000-000000000004', 'Offline', 'Bridgwater', 'TA6 5CC', 5, 5, 20, 'offline', null, extensions.st_setsrid(extensions.st_makepoint(-3.0100, 51.1300), 4326)::extensions.geography),
  ('10000000-0000-0000-0000-000000000005', 'Far', 'Bristol', 'BS1 1AA', 6, 6, 38, 'available', null, extensions.st_setsrid(extensions.st_makepoint(-2.5879, 51.4545), 4326)::extensions.geography);
insert into public.properties (id, name, town, postcode, bedrooms, max_guests, pppn_from)
  values ('10000000-0000-0000-0000-000000000006', 'Needs geocode', 'Leeds', 'LS1 1UR', 4, 4, 30);

do $$
begin
  if (select lat from public.properties where id = '10000000-0000-0000-0000-000000000001') <> 51.1497 then raise exception 'generated lat column wrong'; end if;
  if (select geocode_status from public.properties where id = '10000000-0000-0000-0000-000000000001') <> 'manual' then raise exception 'rows with coordinates should be manual'; end if;
  update public.properties set location = extensions.st_setsrid(extensions.st_makepoint(-1.55, 53.8), 4326)::extensions.geography, geocode_status = 'ok'
    where id = '10000000-0000-0000-0000-000000000006';
  if (select geocode_status from public.properties where id = '10000000-0000-0000-0000-000000000006') <> 'ok' then raise exception 'geocoder status overwritten'; end if;
  update public.properties set location = extensions.st_setsrid(extensions.st_makepoint(-1.56, 53.8), 4326)::extensions.geography
    where id = '10000000-0000-0000-0000-000000000006';
  if (select geocode_status from public.properties where id = '10000000-0000-0000-0000-000000000006') <> 'manual' then raise exception 'manual move not detected'; end if;
  if not exists (select 1 from net.requests where url = 'https://proj.supabase.co/functions/v1/geocode' and body ->> 'id' = '10000000-0000-0000-0000-000000000006' and headers ->> 'x-cron-secret' = 'test-secret') then
    raise exception 'geocode call not queued for new property';
  end if;
end $$;

insert into public.radar_projects (id, source, source_id, title, status, start_date, site_location, supplier_name, supplier_companies_house_number)
values ('20000000-0000-0000-0000-000000000001', 'contracts_finder', 'contracts_finder:ocds-x', 'A39 works', 'qualified', '2026-11-02',
        extensions.st_setsrid(extensions.st_makepoint(-3.0647, 51.1497), 4326)::extensions.geography, 'Kier Highways Limited', '01234567');

-- 4. Matching: available + free-by-start+30 within radius; excludes offline, too-late and too-far.
do $$
declare got text;
begin
  select string_agg(property_id::text || '@' || distance_miles, ',' order by distance_miles) into got
  from public.match_properties('20000000-0000-0000-0000-000000000001', 25);
  if got <> '10000000-0000-0000-0000-000000000001@0.00,10000000-0000-0000-0000-000000000002@2.37' then
    raise exception 'unexpected matches: %', got;
  end if;
end $$;

-- 5. Leads: webhook on insert and status change only, suppression, one lead per radar project.
truncate net.requests;
insert into public.leads (id, source, company_name, companies_house_number, project_id, status)
values ('30000000-0000-0000-0000-000000000001', 'radar', 'Kier Highways Limited', '01234567', '20000000-0000-0000-0000-000000000001', 'new');
do $$ begin
  if (select count(*) from net.requests) <> 0 then raise exception 'webhook must not fire without leads_webhook_url'; end if;
end $$;
insert into vault.secrets values ('leads_webhook_url', 'https://leads.example/hook');
update public.leads set notes = 'no status change' where id = '30000000-0000-0000-0000-000000000001';
update public.leads set status = 'do_not_contact' where id = '30000000-0000-0000-0000-000000000001';
do $$
declare r record;
begin
  if (select count(*) from net.requests) <> 1 then raise exception 'expected exactly one webhook call, got %', (select count(*) from net.requests); end if;
  select * into r from net.requests limit 1;
  if r.url <> 'https://leads.example/hook' or r.body ->> 'event' <> 'lead.status_changed' or r.body ->> 'previous_status' <> 'new'
     or r.body -> 'lead' ->> 'status' <> 'do_not_contact' or r.body -> 'lead' ? 'ip_hash' then
    raise exception 'bad webhook payload: %', r.body;
  end if;
  if not public.is_company_suppressed('01234567', null) or not public.is_company_suppressed(null, ' kier highways limited ')
     or public.is_company_suppressed('99999999', 'Other Ltd') then
    raise exception 'suppression check wrong';
  end if;
end $$;
do $$ begin
  begin
    insert into public.leads (source, project_id) values ('radar', '20000000-0000-0000-0000-000000000001');
    raise exception 'duplicate radar lead allowed';
  exception when unique_violation then null;
  end;
end $$;

-- 6. Rate limiter.
do $$ begin
  if not public.rate_limit_hit('ip:1', 2, 3600) or not public.rate_limit_hit('ip:1', 2, 3600) or public.rate_limit_hit('ip:1', 2, 3600) then
    raise exception 'rate limiter wrong';
  end if;
end $$;

-- 7. Similarity search.
insert into public.seo_pages (page_type, town_id, slug, status, published_snapshot, published_at, search_text)
select 'location', id, 'leeds', 'published', '{"title":"Contractor Accommodation in Leeds"}', now(), 'Contractor accommodation in Leeds with 3 houses near the city centre, bills included, van parking.' from public.towns where slug = 'leeds';
insert into public.seo_pages (page_type, town_id, slug, status, search_text)
select 'location', id, 'bradford', 'draft', 'Contractor accommodation in Bradford with 3 houses near the city centre, bills included, van parking.' from public.towns where slug = 'bradford';
do $$ declare s real;
begin
  select similarity into s from public.seo_similar_pages('Contractor accommodation in Leeds with 3 houses near the city centre, bills included, van parking.', null, 20, 'page') where slug = 'bradford';
  if exists (select 1 from public.seo_similar_pages('Contractor accommodation in Leeds', null, 20, 'blog')) then raise exception 'blog similarity should not include pages'; end if;
  if s is null or s < 0.5 then raise exception 'expected high similarity, got %', s; end if;
  if (select count(*) from public.published_content where kind = 'location') <> 1 then raise exception 'published_content should list 1 location'; end if;
  if (select title from public.published_content where slug = 'leeds') <> 'Contractor Accommodation in Leeds' then raise exception 'published_content title should come from snapshot'; end if;
  if (select name from public.published_content where slug = 'leeds') <> 'Leeds' or (select lat from public.published_content where slug = 'leeds') is null then raise exception 'published_content should carry town name and coordinates'; end if;
end $$;

-- 8. Cron guard: nothing fires while crons are disabled.
truncate net.requests;
select private.run_if_due('radar-run', extract(hour from (now() at time zone 'Europe/London'))::int);
do $$ begin if (select count(*) from net.requests) <> 0 then raise exception 'cron fired while disabled'; end if; end $$;
update public.settings set crons_enabled = true;
select private.run_if_due('radar-run', extract(hour from (now() at time zone 'Europe/London'))::int);
select private.run_if_due('radar-run', (extract(hour from (now() at time zone 'Europe/London'))::int + 1) % 24);
do $$ begin
  if (select count(*) from net.requests where url like '%/radar-run') <> 1 then raise exception 'cron guard wrong'; end if;
end $$;

-- 9. RLS by role.
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

set role anon;
do $$ begin
  if (select count(*) from public.leads) <> 0 or (select count(*) from public.properties) <> 0 or (select count(*) from public.settings) <> 0 then
    raise exception 'anon can read data';
  end if;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from public.properties) <> 0 or (select count(*) from public.towns) <> 0 then raise exception 'non-staff user can read data'; end if;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if (select count(*) from public.leads) <> 1 then raise exception 'sales should read leads'; end if;
  if (select count(*) from public.leads_export) <> 1 then raise exception 'sales should read leads_export'; end if;
  if (select count(*) from public.radar_projects) <> 1 then raise exception 'sales should read radar'; end if;
  if (select count(*) from public.api_usage) <> 0 then null; end if;
  begin
    update public.settings set seo_pages_per_day = 99;
    if (select seo_pages_per_day from public.settings) = 99 then raise exception 'sales changed settings'; end if;
  end;
  begin
    insert into public.seo_pages (page_type, project_name, slug) values ('project', 'X', 'projects/x');
    raise exception 'sales wrote seo_pages';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if (select count(*) from public.leads) <> 0 or (select count(*) from public.leads_export) <> 0 then raise exception 'editor can read leads'; end if;
  if (select count(*) from public.seo_pages) < 16 then raise exception 'editor should read seo pages'; end if;
  insert into public.blog_topics (keyword, working_title) values ('k', 't');
  update public.towns set avg_hotel_pppn = 95 where slug = 'bridgwater';
  if (select avg_hotel_pppn from public.towns where slug = 'bridgwater') <> 95 then raise exception 'editor should edit towns'; end if;
  begin
    insert into public.properties (name, town, postcode, bedrooms, max_guests, pppn_from) values ('x', 'y', 'LS1 1UR', 1, 1, 1);
    raise exception 'editor wrote properties';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from public.leads) <> 1 or (select count(*) from public.admin_users) <> 3 then raise exception 'admin should see everything'; end if;
  update public.settings set seo_pages_per_day = 6;
  if (select seo_pages_per_day from public.settings) <> 6 then raise exception 'admin should update settings'; end if;
end $$;
reset role;

\echo 'All database assertions passed.'
