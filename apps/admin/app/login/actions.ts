"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; message?: string };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "Enter your email" };
  const supabase = await createClient();
  if (!password) {
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: false },
    });
    return error ? { error: error.message } : { message: "Check your email for a sign-in link." };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/");
}
