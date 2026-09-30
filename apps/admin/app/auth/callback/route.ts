import { NextResponse, type NextRequest } from "next/server";
import { safeNext, sameHostUrl } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// PKCE links (magic link and password reset sent from this app) land here with ?code=.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(sameHostUrl(request, "/login?error=link"));
  }
  return NextResponse.redirect(sameHostUrl(request, next));
}
