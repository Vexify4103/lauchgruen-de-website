/**
 * Host-based subdomain routing (Next.js 16 "proxy" file convention —
 * formerly known as middleware).
 *
 * Two hostnames, one app:
 *   - lauchgruen.de             → streamer landing page
 *   - jeopardy.lauchgruen.de    → the QuizDuell app (everything else)
 *
 * The apex domain serves only the landing page. Any other path on the apex
 * gets redirected to the jeopardy subdomain so old links keep working.
 *
 * Localhost / IPs / anything we don't recognize falls back to the quiz app
 * (so dev on localhost:3000 still shows the regular sign-in home).
 */

import { NextResponse, type NextRequest } from "next/server";

// Treat the apex (and www) as landing-only. Anything else = quiz app.
// `.localhost` entries are for local dev — modern browsers (Chrome, Firefox,
// Edge, Safari) auto-resolve any *.localhost subdomain to 127.0.0.1 per
// RFC 6761, so visiting http://lauchgruen.localhost:3000/ Just Works without
// editing the OS hosts file. To test:
//   http://lauchgruen.localhost:3000          → landing page
//   http://jeopardy.lauchgruen.localhost:3000 → quiz app
const APEX_HOSTS = new Set([
  "lauchgruen.de",
  "www.lauchgruen.de",
  "lauchgruen.localhost",
  "www.lauchgruen.localhost",
]);

/**
 * Derive the quiz subdomain from whichever apex host the request came in on,
 * preserving "de" → "de" and "localhost" → "localhost". Lets the same
 * apex-non-root redirect work in dev and prod without env-var juggling.
 */
function quizHostFor(apexHost: string): string {
  const bare = apexHost.replace(/^www\./, "");
  return `jeopardy.${bare}`;
}

export function proxy(req: NextRequest) {
  // `host` includes the port locally (e.g. "localhost:3000"), strip it.
  const rawHost = req.headers.get("host") ?? "";
  const host = rawHost.split(":")[0].toLowerCase();
  const { pathname } = req.nextUrl;

  // ─── Apex domain → landing page ───────────────────────────────────────
  if (APEX_HOSTS.has(host)) {
    // Root path → rewrite to /landing internally (URL bar stays "/").
    if (pathname === "/" || pathname === "") {
      const url = req.nextUrl.clone();
      url.pathname = "/landing";
      return NextResponse.rewrite(url);
    }

    // Anything else on the apex → bounce to the same path on the jeopardy
    // subdomain. Mutating only the hostname keeps the request's port and
    // protocol intact, so it works on both http://lauchgruen.localhost:3000
    // and https://lauchgruen.de in production.
    const url = req.nextUrl.clone();
    url.hostname = quizHostFor(host);
    return NextResponse.redirect(url, { status: 308 });
  }

  // ─── Quiz subdomain (or unknown host / localhost) → pass through ─────
  // But prevent /landing from being directly reachable here — it's only
  // meant to render via the apex rewrite above.
  if (pathname === "/landing" || pathname.startsWith("/landing/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url, { status: 308 });
  }

  return NextResponse.next();
}

// Skip Next internals and static asset paths — they're host-independent and
// running the proxy on them wastes cycles + risks breaking image loading.
export const config = {
  matcher: [
    "/((?!_next/|_vercel/|favicon\\.ico|bear-logo\\.png|questions/|api/health).*)",
  ],
};
