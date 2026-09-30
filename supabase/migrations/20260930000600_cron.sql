-- Scheduled jobs. pg_cron runs in UTC, so each job is scheduled at both candidate UTC hours
-- and only fires when the Europe/London local hour matches. All are gated on settings.crons_enabled,
-- which stays false until the first-run checklist in docs/RUNBOOK.md is done.

create or replace function private.run_if_due(fn text, london_hour integer, body jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select crons_enabled from public.settings where id = 1), false) then
    return;
  end if;
  if extract(hour from (now() at time zone 'Europe/London')) <> london_hour then
    return;
  end if;
  perform private.call_function(fn, body || jsonb_build_object('trigger', 'cron'));
end;
$$;
revoke all on function private.run_if_due(text, integer, jsonb) from public;

select cron.schedule('radar-run-daily', '0 5,6 * * *', $$select private.run_if_due('radar-run', 6)$$);
select cron.schedule('seo-pages-daily', '0 6,7 * * *', $$select private.run_if_due('seo-run', 7, '{"task":"pages"}')$$);
select cron.schedule('seo-blog-mon-wed-fri', '30 6,7 * * 1,3,5', $$select private.run_if_due('seo-run', 7, '{"task":"blog"}')$$);
select cron.schedule('seo-topics-weekly', '45 5,6 * * 1', $$select private.run_if_due('seo-suggest-topics', 6)$$);
select cron.schedule('seo-refresh-monthly', '0 3,4 1 * *', $$select private.run_if_due('seo-run', 4, '{"task":"refresh"}')$$);
select cron.schedule('ai-visibility-weekly', '0 4,5 * * 1', $$select private.run_if_due('ai-visibility-run', 5)$$);

-- Retry geocoding for rows whose trigger call failed. Not gated: geocoding is free and harmless.
select cron.schedule('geocode-sweep', '20 * * * *', $$select private.call_function('geocode', '{"sweep":true}')$$);
