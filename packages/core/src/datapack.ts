import { factNumbers } from "./facts.ts";
import { haversineMiles, roundMiles } from "./geo.ts";
import { hashString, stableStringify } from "./text.ts";
import type { CompanyFacts, LatLng, ProjectType } from "./types.ts";

export interface TownRow extends LatLng {
  id: string;
  name: string;
  slug: string;
  county: string | null;
  region: string | null;
  population: number | null;
  avg_hotel_pppn: number | null;
}

export interface PropertyRow extends LatLng {
  id: string;
  name: string;
  town: string;
  bedrooms: number;
  max_guests: number;
  parking_spaces: number;
  van_parking: boolean;
  pppn_from: number;
  status: "available" | "occupied" | "offline";
  available_from: string | null;
}

export interface ProjectRow extends LatLng {
  id: string;
  title: string;
  project_type: ProjectType | null;
  value_gbp: number | null;
  est_workers_away_from_home: number | null;
  start_date: string | null;
  end_date: string | null;
  supplier_name: string | null;
  site_town: string | null;
  site_location_text: string | null;
}

export interface CostComparison {
  crew_size: number;
  hotel_pppn: number;
  house_pppn: number;
  periods: Array<{
    weeks: number;
    nights: number;
    hotel_total: number;
    house_total: number;
    saving: number;
    saving_pct: number;
  }>;
}

export interface PackProperty {
  town: string;
  bedrooms: number;
  sleeps: number;
  pppn_from: number;
  van_parking: boolean;
  parking_spaces: number;
  distance_miles: number;
}

export interface PackProject {
  title: string;
  project_type: ProjectType | null;
  distance_miles: number;
  value_gbp: number | null;
  workers_away_from_home: number | null;
  start_year: number | null;
  supplier: string | null;
}

export interface LocationDataPack {
  kind: "location";
  town: {
    name: string;
    county: string | null;
    region: string | null;
    population: number | null;
    avg_hotel_pppn: number | null;
  };
  properties: {
    radius_miles: number;
    count: number;
    bedrooms_min: number | null;
    bedrooms_max: number | null;
    total_bedrooms: number;
    from_pppn: number | null;
    with_van_parking: number;
    nearest: PackProperty[];
  };
  projects: { radius_miles: number; items: PackProject[] };
  cost_comparison: CostComparison | null;
  company: CompanyFacts;
}

export interface ProjectDataPack {
  kind: "project";
  project: {
    name: string;
    location: string | null;
    nearest_town: string | null;
    project_type: ProjectType | null;
    value_gbp: number | null;
    workers_away_from_home: number | null;
    start_year: number | null;
    end_year: number | null;
    contractor: string | null;
  };
  towns: Array<{
    name: string;
    distance_miles: number;
    our_houses: number;
    from_pppn: number | null;
    bedrooms_min: number;
    bedrooms_max: number;
    with_van_parking: number;
  }>;
  crew_planning: Array<{ crew_size: number; houses_needed: number; bedrooms_per_house: number }>;
  cost_comparison: CostComparison | null;
  company: CompanyFacts;
}

export type DataPack = LocationDataPack | ProjectDataPack;

export const LOCATION_PROPERTY_RADIUS = 15;
export const LOCATION_PROJECT_RADIUS = 20;
export const PROJECT_TOWN_RADIUS = 25;
const CREW_SIZE = 6;
const COMPARISON_WEEKS = [4, 12];

export function isBookable(p: PropertyRow, byDate?: string): boolean {
  if (p.status === "offline") return false;
  if (p.status === "available") return true;
  if (!byDate || !p.available_from) return false;
  return p.available_from <= byDate;
}

export function costComparison(hotelPppn: number | null, housePppn: number | null, crew = CREW_SIZE): CostComparison | null {
  if (!hotelPppn || !housePppn || housePppn >= hotelPppn) return null;
  const hotel = round2(hotelPppn);
  const house = round2(housePppn);
  return {
    crew_size: crew,
    hotel_pppn: hotel,
    house_pppn: house,
    periods: COMPARISON_WEEKS.map((weeks) => {
      const nights = weeks * 7;
      const hotelTotal = Math.round(hotel * crew * nights);
      const houseTotal = Math.round(house * crew * nights);
      return {
        weeks,
        nights,
        hotel_total: hotelTotal,
        house_total: houseTotal,
        saving: hotelTotal - houseTotal,
        saving_pct: Math.round(((hotelTotal - houseTotal) / hotelTotal) * 100),
      };
    }),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function packProperty(p: PropertyRow, from: LatLng): PackProperty {
  return {
    town: p.town,
    bedrooms: p.bedrooms,
    sleeps: p.max_guests,
    pppn_from: round2(p.pppn_from),
    van_parking: p.van_parking,
    parking_spaces: p.parking_spaces,
    distance_miles: roundMiles(haversineMiles(from, p)),
  };
}

function yearOf(d: string | null): number | null {
  const y = d ? Number(d.slice(0, 4)) : NaN;
  return Number.isFinite(y) ? y : null;
}

export function buildLocationDataPack(args: {
  town: TownRow;
  properties: PropertyRow[];
  projects: ProjectRow[];
  facts: CompanyFacts;
}): LocationDataPack {
  const { town } = args;
  const nearby = args.properties
    .filter((p) => isBookable(p))
    .map((p) => packProperty(p, town))
    .filter((p) => p.distance_miles <= LOCATION_PROPERTY_RADIUS)
    .sort((a, b) => a.distance_miles - b.distance_miles);
  const projects = args.projects
    .map((p) => ({ p, d: roundMiles(haversineMiles(town, p)) }))
    .filter(({ d }) => d <= LOCATION_PROJECT_RADIUS)
    .sort((a, b) => (b.p.value_gbp ?? 0) - (a.p.value_gbp ?? 0))
    .slice(0, 6)
    .map(({ p, d }) => ({
      title: p.title,
      project_type: p.project_type,
      distance_miles: d,
      value_gbp: p.value_gbp,
      workers_away_from_home: p.est_workers_away_from_home,
      start_year: yearOf(p.start_date),
      supplier: p.supplier_name,
    }));
  const fromPppn = nearby.length ? Math.min(...nearby.map((p) => p.pppn_from)) : null;
  return {
    kind: "location",
    town: {
      name: town.name,
      county: town.county,
      region: town.region,
      population: town.population,
      avg_hotel_pppn: town.avg_hotel_pppn,
    },
    properties: {
      radius_miles: LOCATION_PROPERTY_RADIUS,
      count: nearby.length,
      bedrooms_min: nearby.length ? Math.min(...nearby.map((p) => p.bedrooms)) : null,
      bedrooms_max: nearby.length ? Math.max(...nearby.map((p) => p.bedrooms)) : null,
      total_bedrooms: nearby.reduce((s, p) => s + p.bedrooms, 0),
      from_pppn: fromPppn,
      with_van_parking: nearby.filter((p) => p.van_parking).length,
      nearest: nearby.slice(0, 8),
    },
    projects: { radius_miles: LOCATION_PROJECT_RADIUS, items: projects },
    cost_comparison: costComparison(town.avg_hotel_pppn, fromPppn),
    company: args.facts,
  };
}

export function buildProjectDataPack(args: {
  project: {
    name: string;
    location: string | null;
    nearest_town: string | null;
    point: LatLng;
    project_type: ProjectType | null;
    value_gbp: number | null;
    workers_away_from_home: number | null;
    start_date: string | null;
    end_date: string | null;
    contractor: string | null;
  };
  properties: PropertyRow[];
  towns: TownRow[];
  facts: CompanyFacts;
}): ProjectDataPack {
  const { project } = args;
  const nearby = args.properties
    .filter((p) => isBookable(p))
    .map((p) => ({ row: p, pack: packProperty(p, project.point) }))
    .filter(({ pack }) => pack.distance_miles <= PROJECT_TOWN_RADIUS);
  const byTown = new Map<string, PackProperty[]>();
  for (const { pack } of nearby) byTown.set(pack.town, [...(byTown.get(pack.town) ?? []), pack]);
  const towns = [...byTown.entries()]
    .map(([name, props]) => ({
      name,
      distance_miles: Math.min(...props.map((p) => p.distance_miles)),
      our_houses: props.length,
      from_pppn: Math.min(...props.map((p) => p.pppn_from)),
      bedrooms_min: Math.min(...props.map((p) => p.bedrooms)),
      bedrooms_max: Math.max(...props.map((p) => p.bedrooms)),
      with_van_parking: props.filter((p) => p.van_parking).length,
    }))
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, 8);
  const avgBeds = nearby.length
    ? Math.max(1, Math.round(nearby.reduce((s, n) => s + n.pack.bedrooms, 0) / nearby.length))
    : args.facts.property_bedrooms_min;
  const crew_planning = [6, 12, 24, 50].map((crew) => ({
    crew_size: crew,
    houses_needed: Math.ceil(crew / avgBeds),
    bedrooms_per_house: avgBeds,
  }));
  const nearestTownWithHotel = args.towns
    .filter((t) => t.avg_hotel_pppn)
    .map((t) => ({ t, d: haversineMiles(project.point, t) }))
    .sort((a, b) => a.d - b.d)[0];
  const fromPppn = nearby.length ? Math.min(...nearby.map((n) => n.pack.pppn_from)) : null;
  return {
    kind: "project",
    project: {
      name: project.name,
      location: project.location,
      nearest_town: project.nearest_town,
      project_type: project.project_type,
      value_gbp: project.value_gbp,
      workers_away_from_home: project.workers_away_from_home,
      start_year: yearOf(project.start_date),
      end_year: yearOf(project.end_date),
      contractor: project.contractor,
    },
    towns,
    crew_planning,
    cost_comparison:
      nearestTownWithHotel && nearestTownWithHotel.d <= PROJECT_TOWN_RADIUS
        ? costComparison(nearestTownWithHotel.t.avg_hotel_pppn, fromPppn)
        : null,
    company: args.facts,
  };
}

export function dataPackHash(pack: DataPack): string {
  return hashString(stableStringify(pack));
}

/** Every number the generated copy may state: pack values, their common roundings, and company facts. */
export function allowedNumbers(pack: DataPack): Set<number> {
  const out = new Set<number>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    out.add(n);
    out.add(Math.round(n));
    out.add(Math.round(n * 10) / 10);
    out.add(Math.floor(n));
    if (n >= 1000) {
      out.add(Math.round(n / 1000));
      out.add(Math.round(n / 100) / 10);
    }
    if (n >= 1_000_000) {
      out.add(Math.round(n / 1_000_000));
      out.add(Math.round(n / 100_000) / 10);
      out.add(Math.round(n / 10_000) / 100);
    }
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") add(v);
    else if (typeof v === "string") {
      for (const m of v.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) add(Number(m.replace(/,/g, "")));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(pack);
  for (const n of factNumbers(pack.company)) add(n);
  return out;
}
