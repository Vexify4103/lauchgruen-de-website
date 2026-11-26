/** POST /api/winchallenge/signup: { acceptRules: true }. Needs Discord login and a linked Twitch account. */
import { z } from "zod";
import { getTwitchLink } from "@/lib/tournament-storage";
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { getVisibleChallenge, signUp } from "@/lib/winchallenge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ acceptRules: z.literal(true) });

export async function POST(request: Request) {
	const user = await currentUser();
	if (!user) return winError(401, "Bitte mit Discord anmelden.");
	if (!schema.safeParse(await request.json().catch(() => null)).success) return winError(400, "Bitte die Regeln und den Einsatz bestätigen.");
	try {
		const challenge = await getVisibleChallenge();
		if (!challenge) return winError(404, "Aktuell gibt es keine Challenge.");
		const link = await getTwitchLink(user.discordId);
		if (!link) return winError(400, "Verknüpfe zuerst deinen Twitch-Account.", "twitch-missing");
		const participant = await signUp({ challenge, discordId: user.discordId, discordName: user.name, twitchId: link.twitchUserId, twitchLogin: link.login });
		return winJson({ ok: true, participantId: participant.id });
	} catch (error) {
		return handleWinError(error, "Anmeldung fehlgeschlagen.");
	}
}
