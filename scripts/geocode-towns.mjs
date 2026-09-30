#!/usr/bin/env node
// Refreshes town coordinates from postcodes.io (/places). The seed ships town-centre coordinates;
// run this once after deploying if you want postcodes.io's values instead.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm geocode:towns [--only-missing]
const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const onlyMissing = process.argv.includes("--only-missing");
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const filter = onlyMissing ? "&location=is.null" : "";
const towns = await (
  await fetch(`${url}/rest/v1/towns?select=id,name,county${filter}&order=name`, { headers })
).json();
let ok = 0;
let missed = 0;
for (const t of towns) {
  const res = await fetch(
    `https://api.postcodes.io/places?q=${encodeURIComponent(t.name)}&limit=5`
  );
  const body = res.ok ? await res.json() : { result: [] };
  const hits = (body.result ?? []).filter((p) => p.name_1?.toLowerCase() === t.name.toLowerCase());
  const pick =
    hits.find(
      (p) =>
        !t.county ||
        [p.county_unitary, p.district_borough, p.region].some((x) => x?.includes(t.county))
    ) ?? hits[0];
  if (!pick) {
    missed++;
    console.log(`  not found: ${t.name}`);
  } else {
    const r = await fetch(`${url}/rest/v1/towns?id=eq.${t.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        location: `SRID=4326;POINT(${pick.longitude} ${pick.latitude})`,
        geocode_status: "ok",
      }),
    });
    if (r.ok) ok++;
    else missed++;
  }
  await sleep(150);
}
console.log(`Updated ${ok} towns, ${missed} not found (kept their existing coordinates).`);
