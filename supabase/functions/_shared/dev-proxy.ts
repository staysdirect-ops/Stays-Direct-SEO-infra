// Local end-to-end testing only: when DEV_EXTERNAL_API_PROXY is set, requests to external APIs are
// sent to `${proxy}/${host}${path}` (see scripts/dev/mock-apis.mjs). Never set this in production.
const EXTERNAL_HOSTS = [
  "www.contractsfinder.service.gov.uk",
  "www.find-tender.service.gov.uk",
  "api.postcodes.io",
  "api.company-information.service.gov.uk",
  "api.anthropic.com",
  "api.openai.com",
  "api.perplexity.ai",
  "staysdirect.co.uk",
];

const proxy = Deno.env.get("DEV_EXTERNAL_API_PROXY")?.replace(/\/+$/, "");
if (proxy) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input));
    if (EXTERNAL_HOSTS.includes(url.hostname)) {
      const target = `${proxy}/${url.hostname}${url.pathname}${url.search}`;
      return req ? realFetch(new Request(target, req), init) : realFetch(target, init);
    }
    return realFetch(input, init);
  };
  console.warn(`DEV_EXTERNAL_API_PROXY active: external APIs routed to ${proxy}`);
}
