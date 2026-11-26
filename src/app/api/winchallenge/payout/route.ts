/**
 * POST /api/winchallenge/payout: { id, action: "paid" | "confirm" }
 * The payer marks a gift as sent; the recipient confirms it. Own entries only.
 */
import { z } from "zod";
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { getCurrentChallenge, getParticipantByDiscord, listPayouts, setPayoutStatus } from "@/lib/winchallenge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().min(1).max(80), action: z.enum(["paid", "confirm"]) });

export async function POST(request: Request) {
	const user = await currentUser();
	if (!user) return winError(401, "Bitte mit Discord anmelden.");
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return winError(400, "Ungültige Aktion.");
	try {
		const challenge = await getCurrentChallenge();
		if (!challenge) return winError(404, "Aktuell gibt es keine Challenge.");
		const participant = await getParticipantByDiscord(challenge.id, user.discordId);
		const payout = (await listPayouts(challenge.id)).find((entry) => entry.id === parsed.data.id);
		if (!participant || !payout) return winError(404, "Eintrag nicht gefunden.");
		const paid = parsed.data.action === "paid";
		if (paid ? payout.payerId !== participant.id : payout.recipientId !== participant.id) return winError(403, "Das ist nicht dein Eintrag.");
		const updated = await setPayoutStatus({
			payoutId: payout.id,
			challengeId: challenge.id,
			status: paid ? "paid" : "confirmed",
			allowedFrom: paid ? ["open"] : ["open", "paid"],
			actor: user.name,
		});
		if (!updated) return winError(409, paid ? "Der Sub ist schon als verschenkt markiert." : "Der Sub ist schon bestätigt.");
		return winJson({ ok: true, status: updated.status });
	} catch (error) {
		return handleWinError(error, "Speichern fehlgeschlagen.");
	}
}
