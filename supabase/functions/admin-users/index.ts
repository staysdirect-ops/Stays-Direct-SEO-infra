import { authorize, db, handler, HttpError, json, must, readBody } from "../_shared/runtime.ts";

// Admin-only team management: list staff, invite by email, change or remove a role.
// Uses the service role for the Auth admin API, so the admin app never holds that key.
type Role = "admin" | "sales" | "editor";
const ROLES: Role[] = ["admin", "sales", "editor"];

interface Body {
  action?: "list" | "invite" | "set_role";
  email?: string;
  role?: Role | null;
  user_id?: string;
  redirect_to?: string;
}

async function listUsers() {
  const users: Array<{
    id: string;
    email?: string;
    last_sign_in_at?: string | null;
    created_at: string;
    invited_at?: string | null;
    email_confirmed_at?: string | null;
  }> = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const roles = must(await db().from("admin_users").select("user_id,role"), "roles") as Array<{
    user_id: string;
    role: Role;
  }>;
  const roleOf = new Map(roles.map((r) => [r.user_id, r.role]));
  return users
    .map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: roleOf.get(u.id) ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      invited_at: u.invited_at ?? null,
      confirmed: !!u.email_confirmed_at,
      created_at: u.created_at,
    }))
    .sort(
      (a, b) => (a.role ? 0 : 1) - (b.role ? 0 : 1) || (a.email ?? "").localeCompare(b.email ?? "")
    );
}

async function setRole(userId: string, email: string | null, role: Role | null) {
  if (role) {
    must(
      await db()
        .from("admin_users")
        .upsert({ user_id: userId, email, role }, { onConflict: "user_id" }),
      "set role"
    );
  } else {
    must(await db().from("admin_users").delete().eq("user_id", userId), "remove role");
  }
}

Deno.serve(
  handler(async (req) => {
    const caller = await authorize(req, []);
    if (caller.kind !== "user" || caller.role !== "admin") throw new HttpError(403, "Admins only");
    const body = await readBody<Body>(req);

    if (!body.action || body.action === "list") return json({ users: await listUsers() });

    if (body.role != null && !ROLES.includes(body.role))
      throw new HttpError(400, "role must be admin, sales or editor");

    if (body.action === "invite") {
      const email = body.email?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new HttpError(400, "Enter a valid email");
      if (!body.role) throw new HttpError(400, "Choose a role");
      const existing = (await listUsers()).find((u) => u.email === email);
      if (existing) {
        await setRole(existing.id, email, body.role);
        return json({
          ok: true,
          message: `${email} already had an account; role set to ${body.role}.`,
        });
      }
      const redirectTo =
        body.redirect_to && /^https?:\/\//.test(body.redirect_to) ? body.redirect_to : undefined;
      const { data, error } = await db().auth.admin.inviteUserByEmail(
        email,
        redirectTo ? { redirectTo } : undefined
      );
      if (error || !data.user) throw new HttpError(400, error?.message ?? "Invite failed");
      await setRole(data.user.id, email, body.role);
      return json({ ok: true, message: `Invite sent to ${email} as ${body.role}.` });
    }

    if (body.action === "set_role") {
      if (!body.user_id) throw new HttpError(400, "user_id is required");
      if (body.user_id === caller.userId && body.role !== "admin")
        throw new HttpError(400, "You can't remove your own admin access");
      const { data } = await db().auth.admin.getUserById(body.user_id);
      if (!data.user) throw new HttpError(404, "User not found");
      await setRole(body.user_id, data.user.email ?? null, body.role ?? null);
      return json({
        ok: true,
        message: body.role ? `Role set to ${body.role}.` : "Access removed.",
      });
    }

    throw new HttpError(400, "Unknown action");
  })
);
