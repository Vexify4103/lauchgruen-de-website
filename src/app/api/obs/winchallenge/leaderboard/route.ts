/** GET /api/obs/winchallenge/leaderboard: top teams and the feed for the stream overlay (public, no login). */
import { handleWinError, winJson } from "@/lib/winchallenge/http";
import { buildPublicChallenge } from "@/lib/winchallenge/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 10, 1), 50);
	try {
		const view = await buildPublicChallenge();
		return winJson({ ...view, teams: view.teams.slice(0, limit), feed: view.feed.slice(0, 10) });
	} catch (error) {
		return handleWinError(error, "Overlay-Daten konnten nicht geladen werden.");
	}
}
