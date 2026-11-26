/**
 * GET   /api/winchallenge/me: own sign-up, team (with join code), Twitch link, payouts.
 * PATCH /api/winchallenge/me: { wishChannel } channel for receiving gifted subs.
 */
import { z } from "zod";
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { loadMyState } from "@/lib/winchallenge/me";
import { setWishChannel } from "@/lib/winchallenge/store";

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

const patchSchema = z.object({
	wishChannel: z
		.string()
		.trim()
		.max(25)
		.regex(/^[a-zA-Z0-9_]*$/, "Nur der Twitch-Name, ohne Link.")
		.nullable(),
});

export async function PATCH(request: Request) {
	const user = await currentUser();
	if (!user) return winError(401, "Bitte mit Discord anmelden.");
	const parsed = patchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return winError(400, parsed.error.issues[0]?.message ?? "Ungültiger Kanal.");
	try {
		const { participant } = await loadMyState(user.discordId);
		if (!participant) return winError(404, "Du bist nicht angemeldet.");
		await setWishChannel(participant.id, parsed.data.wishChannel ? parsed.data.wishChannel.toLowerCase() : null);
		return winJson({ ok: true });
	} catch (error) {
		return handleWinError(error, "Kanal konnte nicht gespeichert werden.");
	}
}
