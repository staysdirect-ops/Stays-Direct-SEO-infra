import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  qualified: "bg-emerald-100 text-emerald-800",
  lead_created: "bg-violet-100 text-violet-800",
  needs_review: "bg-amber-100 text-amber-800",
  rejected: "bg-slate-200 text-slate-600",
  researching: "bg-sky-100 text-sky-800",
  ready: "bg-indigo-100 text-indigo-800",
  contacted: "bg-violet-100 text-violet-800",
  replied: "bg-teal-100 text-teal-800",
  quoted: "bg-orange-50 text-orange-600",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-200 text-slate-600",
  do_not_contact: "bg-red-100 text-red-800",
  queued: "bg-slate-100 text-slate-700",
  generating: "bg-sky-100 text-sky-800",
  draft: "bg-amber-100 text-amber-800",
  in_review: "bg-indigo-100 text-indigo-800",
  approved: "bg-teal-100 text-teal-800",
  published: "bg-emerald-100 text-emerald-800",
  needs_refresh: "bg-orange-50 text-orange-600",
  idea: "bg-slate-100 text-slate-700",
  written: "bg-emerald-100 text-emerald-800",
  success: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-sky-100 text-sky-800",
  skipped: "bg-slate-100 text-slate-600",
  available: "bg-emerald-100 text-emerald-800",
  occupied: "bg-amber-100 text-amber-800",
  offline: "bg-slate-200 text-slate-600",
  live: "bg-emerald-600 text-white",
};

export function Badge({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  const key = tone ?? String(children);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[key] ?? "bg-slate-100 text-slate-700",
        className
      )}
    >
      {typeof children === "string" ? children.replace(/_/g, " ") : children}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  const tone =
    score >= 70
      ? "bg-emerald-100 text-emerald-800"
      : score >= 45
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-200 text-slate-700";
  return (
    <span
      className={cn(
        "inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold",
        tone
      )}
    >
      {score}
    </span>
  );
}
