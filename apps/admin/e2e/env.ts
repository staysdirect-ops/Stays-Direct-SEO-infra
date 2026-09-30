export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const PASSWORD = "e2e-password-123";

export const USERS = {
  admin: "admin@e2e.test",
  sales: "sales@e2e.test",
  editor: "editor@e2e.test",
} as const;
export type TestRole = keyof typeof USERS;
