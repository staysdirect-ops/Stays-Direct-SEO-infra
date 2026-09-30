"use server";

import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(password: string, confirm: string): Promise<ActionResult> {
  try {
    await requireRole(["sales", "editor"]);
    if (password.length < 10) return fail("Use at least 10 characters.");
    if (password !== confirm) return fail("The passwords don't match.");
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return ok("Password saved. You can now sign in with it.");
  } catch (e) {
    return fail(e);
  }
}
