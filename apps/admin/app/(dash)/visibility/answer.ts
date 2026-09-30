"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function getAnswer(
  checkId: number
): Promise<{ response_text: string | null; cited_urls: string[]; model: string } | null> {
  await requireRole(["editor", "sales"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_visibility_checks")
    .select("response_text,cited_urls,model")
    .eq("id", checkId)
    .maybeSingle();
  return data;
}
