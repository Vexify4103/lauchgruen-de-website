/**
 * GET /api/twitch/status?login=<login>
 *
 * Returns the current live state + user info for a Twitch channel.
 * Used by the landing page's <LiveStatus/> component, which polls this
 * every 60 seconds.
 *
 * Defaults to `lauchgruentv` (the streamer this site is about) so callers
 * don't have to know the login.
 *
 * Stream + user data are cached server-side (30s / 1h), so heavy polling
 * doesn't propagate to Twitch.
 */

import { NextResponse } from "next/server";
import { getStream, getUser } from "@/lib/twitch";

const DEFAULT_LOGIN = "lauchgruen";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const login = (url.searchParams.get("login") ?? DEFAULT_LOGIN).toLowerCase();

  // Run both calls in parallel.
  const [stream, user] = await Promise.all([
    getStream(login),
    getUser(login),
  ]);

  return NextResponse.json(
    {
      login,
      live: !!stream,
      stream,
      user,
    },
    {
      // Browsers/Next can additionally cache for 15s — bound is the
      // server-side cache (30s) so this never serves stale-by-more-than-45s.
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30" },
    },
  );
}
