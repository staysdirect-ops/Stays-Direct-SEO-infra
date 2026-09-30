import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "admin" | "sales" | "editor";

export interface Staff {
  userId: string;
  email: string | null;
  role: Role;
}

export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.role) return null;
  return { userId: user.id, email: user.email ?? null, role: data.role as Role };
});

export function canAccess(role: Role, needs: Role[]): boolean {
  return role === "admin" || needs.includes(role);
}

/** For pages and actions: redirects signed-out users and blocks roles without access. */
export async function requireRole(needs: Role[]): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!canAccess(staff.role, needs)) redirect("/?forbidden=1");
  return staff;
}
