/**
 * GET   /api/winchallenge/me: own sign-up, team (with join code), Twitch link, payouts.
 * PATCH /api/winchallenge/me: { subTarget: self | partner } who receives this player's gifted subs.
 */
import { z } from "zod";
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { loadMyState } from "@/lib/winchallenge/me";
import { setSubTarget } from "@/lib/winchallenge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	const user = await currentUser();
	if (!user) return winJson({ loggedIn: false });
	try {
		const { state } = await loadMyState(user.discordId);
		return winJson({ loggedIn: true, isOwner: user.isOwner, ...state });
	} catch (error) {
		return handleWinError(error, "Deine Daten konnten nicht geladen werden.");
	}
}

const patchSchema = z.object({ subTarget: z.enum(["self", "partner"]) });

export async function PATCH(request: Request) {
	const user = await currentUser();
	if (!user) return winError(401, "Bitte mit Discord anmelden.");
	const parsed = patchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return winError(400, parsed.error.issues[0]?.message ?? "Ungültige Auswahl.");
	try {
		const { participant } = await loadMyState(user.discordId);
		if (!participant) return winError(404, "Du bist nicht angemeldet.");
		await setSubTarget(participant.id, parsed.data.subTarget);
		return winJson({ ok: true });
	} catch (error) {
		return handleWinError(error, "Auswahl konnte nicht gespeichert werden.");
	}
}
