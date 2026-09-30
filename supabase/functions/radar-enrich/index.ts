import { radarStepServer } from "../_shared/radar.ts";

Deno.serve(radarStepServer("radar-enrich"));
