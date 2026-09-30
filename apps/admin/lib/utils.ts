import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(v: string | null | undefined, withTime = false): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(
    "en-GB",
    withTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" }
  );
}

export function fmtMoney(v: number | string | null | undefined, compact = true): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (compact && n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (compact && n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

export function fmtUsd(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

export function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
