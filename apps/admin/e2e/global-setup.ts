import { createClient } from "@supabase/supabase-js";
import { PASSWORD, SERVICE_ROLE_KEY, SUPABASE_URL, USERS } from "./env";

/** Creates one user per role (idempotent) and a property to attach photos to. */
export default async function globalSetup() {
  if (!SERVICE_ROLE_KEY) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY for the local stack");
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  for (const [role, email] of Object.entries(USERS)) {
    let user = list.users.find((u) => u.email === email);
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user;
    } else {
      await db.auth.admin.updateUserById(user.id, { password: PASSWORD });
    }
    const { error } = await db
      .from("admin_users")
      .upsert({ user_id: user.id, email, role }, { onConflict: "user_id" });
    if (error) throw error;
  }
  // Remove invitees left over from earlier runs so the invite test starts clean.
  for (const u of list.users.filter((u) => u.email?.startsWith("invitee-")))
    await db.auth.admin.deleteUser(u.id);

  const { data: existing } = await db
    .from("properties")
    .select("id")
    .eq("name", "E2E Photo House")
    .maybeSingle();
  if (!existing) {
    const { error } = await db.from("properties").insert({
      name: "E2E Photo House",
      town: "Bridgwater",
      postcode: "TA6 3AA",
      bedrooms: 4,
      max_guests: 6,
      pppn_from: 30,
    });
    if (error) throw error;
  } else {
    await db.from("properties").update({ photos: [] }).eq("id", existing.id);
  }
}
