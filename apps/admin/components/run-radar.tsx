"use client";

import { useState } from "react";
import { runRadar } from "@/app/(dash)/radar/actions";
import { ActionButton } from "./action-button";
import { Select } from "./ui/input";

export function RunRadar() {
  const [backfill, setBackfill] = useState("");
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Select
        value={backfill}
        onChange={(e) => setBackfill(e.target.value)}
        className="w-40"
        aria-label="Backfill window"
      >
        <option value="">Since last run</option>
        <option value="7">Backfill 7 days</option>
        <option value="30">Backfill 30 days</option>
        <option value="90">Backfill 90 days</option>
      </Select>
      <ActionButton action={() => runRadar(backfill ? Number(backfill) : null)}>
        Run Radar now
      </ActionButton>
    </div>
  );
}
