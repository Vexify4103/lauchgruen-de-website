/**
 * POST /api/winchallenge/subcheck: reads the subscriber lists of all connected payout channels and
 * confirms proven gifts. Any participant of the ended challenge may trigger it; channels are throttled.
 */
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { getParticipantByDiscord, getVisibleChallenge } from "@/lib/winchallenge/store";
import { checkSubs } from "@/lib/winchallenge/subcheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
	const user = await currentUser();
	if (!user) return winError(401, "Bitte mit Discord anmelden.");
	try {
		const challenge = await getVisibleChallenge();
		if (!challenge || challenge.status === "open") return winError(409, "Die Challenge läuft noch.");
		if (!(await getParticipantByDiscord(challenge.id, user.discordId))) return winError(403, "Du bist bei dieser Challenge nicht angemeldet.");
		const result = await checkSubs(challenge);
		return winJson({ ok: true, confirmed: result.confirmedIds.length, channels: result.channels });
	} catch (error) {
		return handleWinError(error, "Prüfung fehlgeschlagen.");
	}
}
