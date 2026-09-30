/** Only same-site relative paths, so auth links can't be used as open redirects. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}

/**
 * Absolute URL on the host the browser actually used. `request.url` can report the server's
 * bind address (e.g. localhost) instead, which would drop the session cookie on redirect.
 */
export function sameHostUrl(request: Request, path: string): URL {
  const h = request.headers;
  const fallback = new URL(request.url);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? fallback.host;
  const proto = h.get("x-forwarded-proto") ?? fallback.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}
