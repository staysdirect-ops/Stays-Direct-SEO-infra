import { sitemapEntries, sitemapXml } from "../_shared/core/index.ts";
import { liveIndex, publicHeaders } from "../_shared/public.ts";
import { handler } from "../_shared/runtime.ts";

// Serve as https://staysdirect.co.uk/sitemap-seo.xml via a rewrite.
Deno.serve(
  handler(async () => {
    const xml = sitemapXml(sitemapEntries(await liveIndex()));
    return new Response(xml, { headers: publicHeaders("application/xml; charset=utf-8") });
  })
);
