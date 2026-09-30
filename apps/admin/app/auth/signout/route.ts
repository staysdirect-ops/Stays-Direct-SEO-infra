import { NextResponse, type NextRequest } from "next/server";
import { sameHostUrl } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(sameHostUrl(request, "/login"), { status: 303 });
}
