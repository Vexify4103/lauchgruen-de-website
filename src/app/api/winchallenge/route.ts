/** GET /api/winchallenge: public leaderboard, games, pot and feed of the current challenge. */
import { handleWinError, winJson } from "@/lib/winchallenge/http";
import { buildPublicChallenge } from "@/lib/winchallenge/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	try {
		return winJson(await buildPublicChallenge());
	} catch (error) {
		return handleWinError(error, "Challenge-Daten konnten nicht geladen werden.");
	}
}
