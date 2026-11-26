/**
 * GET /api/winchallenge: public leaderboard, games, pot and feed of the current challenge.
 * After the end, the automatic sub check runs after the response, so the next poll shows the result.
 */
import { after } from "next/server";
import { handleWinError, winJson } from "@/lib/winchallenge/http";
import { autoCheckSubs } from "@/lib/winchallenge/subcheck";
import { buildPublicChallenge } from "@/lib/winchallenge/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const view = await buildPublicChallenge();
		if (view.challenge && view.challenge.status !== "open" && view.payouts.done < view.payouts.total) after(autoCheckSubs);
		return winJson(view);
	} catch (error) {
		return handleWinError(error, "Challenge-Daten konnten nicht geladen werden.");
	}
}
