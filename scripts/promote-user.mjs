#!/usr/bin/env node
// Gives an existing Supabase Auth user a role in the admin app.
//   pnpm promote-user someone@staysdirect.co.uk admin|sales|editor
//   pnpm promote-user someone@example.com editor --create --password '...'   (creates the user first)
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.

const [email, role, ...rest] = process.argv.slice(2);
const create = rest.includes("--create");
const password = rest.includes("--password") ? rest[rest.indexOf("--password") + 1] : undefined;
const ROLES = ["admin", "sales", "editor"];

if (!email || !ROLES.includes(role)) {
  console.error("Usage: pnpm promote-user <email> <admin|sales|editor> [--create --password <pw>]");
  process.exit(1);
}
const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

async function call(path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function findUser(target) {
  for (let page = 1; page < 200; page++) {
    const body = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = body.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

let user = await findUser(email);
if (!user && create) {
  user = await call("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  console.log(`Created ${email}`);
}
if (!user) {
  console.error(
    `No user ${email}. Invite them from the Supabase dashboard (Authentication > Users) first, or pass --create.`
  );
  process.exit(1);
}
await call("/rest/v1/admin_users?on_conflict=user_id", {
  method: "POST",
  headers: { prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ user_id: user.id, email: user.email, role }),
});
console.log(`${email} is now ${role}.`);
