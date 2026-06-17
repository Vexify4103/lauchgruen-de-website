/**
 * GET /api/twitch/clips?login=<login>&count=<n>
 *
 * Returns the most-viewed clips for a channel from the last ~30 days.
 * Used by the landing page's <RecentClips/> component. Server-side cached
 * for 10 minutes.
 */

import { NextResponse } from "next/server";
import { getClips } from "@/lib/twitch";

const DEFAULT_LOGIN = "lauchgruen";
const MAX_COUNT = 12;

export async function GET(req: Request) {
	const url = new URL(req.url);
	const login = (url.searchParams.get("login") ?? DEFAULT_LOGIN).toLowerCase();
	const countParam = Number.parseInt(url.searchParams.get("count") ?? "6", 10);
	const count = Math.max(1, Math.min(MAX_COUNT, Number.isFinite(countParam) ? countParam : 6));

	const clips = await getClips(login, count);

	return NextResponse.json(
		{ login, clips },
		{
			headers: { "Cache-Control": "public, max-age=120, s-maxage=600" },
		}
	);
}
