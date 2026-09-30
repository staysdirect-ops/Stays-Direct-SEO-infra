import { createClient } from "./supabase/server";

/** Invokes an edge function as the signed-in user; the function checks the user's role. */
export async function invokeFunction(
  name: string,
  body: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const j = await ctx.json().catch(() => null);
      if (j?.error) detail = String(j.error);
    }
    throw new Error(`${name}: ${detail}`);
  }
  return (data ?? {}) as Record<string, unknown>;
}
