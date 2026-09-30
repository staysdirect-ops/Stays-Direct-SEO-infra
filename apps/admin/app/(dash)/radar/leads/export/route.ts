import { NextResponse } from "next/server";
import { getStaff, canAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Guard against spreadsheet formula injection from scraped or form text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET() {
  const staff = await getStaff();
  if (!staff || !canAccess(staff.role, ["sales"]))
    return new NextResponse("Forbidden", { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads_export")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) return new NextResponse(error.message, { status: 500 });
  const rows = data ?? [];
  const cols = rows[0] ? Object.keys(rows[0]) : ["id"];
  const csv = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(",")),
  ].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="staysdirect-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
