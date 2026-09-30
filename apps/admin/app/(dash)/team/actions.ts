"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole, type Role } from "@/lib/auth";
import { invokeFunction } from "@/lib/functions";

export interface TeamMember {
  id: string;
  email: string | null;
  role: Role | null;
  last_sign_in_at: string | null;
  invited_at: string | null;
  confirmed: boolean;
  created_at: string;
}

export async function listTeam(): Promise<TeamMember[]> {
  await requireRole([]);
  const r = await invokeFunction("admin-users", { action: "list" });
  return (r.users ?? []) as TeamMember[];
}

export async function inviteMember(email: string, role: Role): Promise<ActionResult> {
  try {
    await requireRole([]);
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const r = await invokeFunction("admin-users", {
      action: "invite",
      email,
      role,
      redirect_to: `${origin}/account?welcome=1`,
    });
    revalidatePath("/team");
    return ok(String(r.message ?? "Invited."));
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberRole(userId: string, role: Role | null): Promise<ActionResult> {
  try {
    await requireRole([]);
    const r = await invokeFunction("admin-users", { action: "set_role", user_id: userId, role });
    revalidatePath("/team");
    return ok(String(r.message ?? "Saved."));
  } catch (e) {
    return fail(e);
  }
}
