/**
 * GET /api/twitch/clips?login=<login>&count=<n>&period=<30d|all>&sort=<views|date>
 *
 * Returns clips for the landing page and the public clip archive. Twitch data
 * is server-side cached for 10 minutes.
 */

import { NextResponse } from "next/server";
import { getClipCollection, getClips } from "@/lib/twitch";

const DEFAULT_LOGIN = "lauchgruen";
const MAX_COUNT = 60;

export async function GET(req: Request) {
	const url = new URL(req.url);
	const login = (url.searchParams.get("login") ?? DEFAULT_LOGIN).toLowerCase();
	const countParam = Number.parseInt(url.searchParams.get("count") ?? "6", 10);
	const count = Math.max(1, Math.min(MAX_COUNT, Number.isFinite(countParam) ? countParam : 6));
	const period = url.searchParams.get("period") === "all" ? "all" : "30d";
	const sort = url.searchParams.get("sort") === "date" ? "date" : "views";
	const homepage = url.searchParams.get("homepage") === "1";

	if (homepage) {
		const result = await getClips(login, count);
		return NextResponse.json(
			{ login, period: "30d", sort: "views", total: result.clips.length, hasMore: false, ...result },
			{ headers: { "Cache-Control": "public, max-age=120, s-maxage=600" } }
		);
	}

	const collection = await getClipCollection(login, period === "all" ? "popular" : "recent");
	const clips = [...collection].sort((left, right) =>
		sort === "date" ? new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() : right.viewCount - left.viewCount
	);

	return NextResponse.json(
		{ login, period, sort, clips: clips.slice(0, count), total: clips.length, hasMore: clips.length > count },
		{
			headers: { "Cache-Control": "public, max-age=120, s-maxage=600" },
		}
	);
}
