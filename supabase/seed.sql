-- LOCAL DEVELOPMENT ONLY. `supabase db reset` loads this; `supabase db push` never does.
-- Demo properties so Radar matching and content generation have stock to work with.

insert into public.properties (name, address, town, postcode, bedrooms, max_guests, parking_spaces, van_parking, pppn_from, status, available_from, location, notes) values
  ('DEMO Wembdon Road House', 'Demo address', 'Bridgwater', 'TA6 7AA', 5, 5, 3, true, 32, 'available', null, extensions.st_setsrid(extensions.st_makepoint(-3.0152, 51.1352), 4326)::extensions.geography, 'Demo data'),
  ('DEMO Cannington Farmhouse', 'Demo address', 'Cannington', 'TA5 2LD', 6, 6, 4, true, 29.5, 'available', null, extensions.st_setsrid(extensions.st_makepoint(-3.0647, 51.1497), 4326)::extensions.geography, 'Demo data'),
  ('DEMO North Petherton Villa', 'Demo address', 'North Petherton', 'TA6 6NA', 4, 4, 2, false, 35, 'available', null, extensions.st_setsrid(extensions.st_makepoint(-3.0148, 51.0914), 4326)::extensions.geography, 'Demo data'),
  ('DEMO Leiston Crew House', 'Demo address', 'Leiston', 'IP16 4AA', 6, 6, 3, true, 31, 'available', null, extensions.st_setsrid(extensions.st_makepoint(1.5780, 52.2090), 4326)::extensions.geography, 'Demo data'),
  ('DEMO Whitehaven Harbour House', 'Demo address', 'Whitehaven', 'CA28 7AA', 5, 5, 2, true, 30, 'available', null, extensions.st_setsrid(extensions.st_makepoint(-3.5870, 54.5489), 4326)::extensions.geography, 'Demo data'),
  ('DEMO Workington Terrace', 'Demo address', 'Workington', 'CA14 3AA', 4, 4, 2, false, 28, 'occupied', current_date + 20, extensions.st_setsrid(extensions.st_makepoint(-3.5448, 54.6425), 4326)::extensions.geography, 'Demo data'),
  ('DEMO Leeds City House', 'Demo address', 'Leeds', 'LS6 1AA', 6, 6, 1, false, 34, 'available', null, extensions.st_setsrid(extensions.st_makepoint(-1.5650, 53.8150), 4326)::extensions.geography, 'Demo data');

update public.towns set avg_hotel_pppn = 95, notes = 'Demo hotel rate' where slug = 'bridgwater';
update public.towns set avg_hotel_pppn = 110, notes = 'Demo hotel rate' where slug = 'leiston';
update public.towns set avg_hotel_pppn = 85, notes = 'Demo hotel rate' where slug in ('whitehaven', 'workington', 'burnham-on-sea', 'minehead');
