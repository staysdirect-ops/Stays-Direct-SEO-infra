import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@staysdirect/core"],
  // Accept either the Next.js-style or the plain Supabase variable names.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
  },
  poweredByHeader: false,
};

export default nextConfig;
