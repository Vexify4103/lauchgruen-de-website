/**
 * POST /api/winchallenge/team
 * { action: "create", name } | { action: "join", code } | { action: "leave" } | { action: "new-code" }
 */
import { z } from "zod";
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { loadMyState } from "@/lib/winchallenge/me";
import { createTeam, getCurrentChallenge, joinTeam, leaveTeam, regenerateJoinCode } from "@/lib/winchallenge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("create"), name: z.string().trim().min(2).max(40) }),
	z.object({ action: z.literal("join"), code: z.string().trim().min(4).max(20) }),
	z.object({ action: z.literal("leave") }),
	z.object({ action: z.literal("new-code") }),
]);

// Join attempts per user and minute, so codes cannot be guessed.
const joinAttempts = new Map<string, number[]>();
function joinAllowed(discordId: string): boolean {
	const now = Date.now();
	const recent = (joinAttempts.get(discordId) ?? []).filter((at) => now - at < 60_000);
	recent.push(now);
	joinAttempts.set(discordId, recent);
	return recent.length <= 10;
}

export async function POST(request: Request) {
	const user = await currentUser();
	if (!user) return winError(401, "Bitte mit Discord anmelden.");
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return winError(400, "Teamname braucht 2 bis 40 Zeichen, der Code 6 Zeichen.");
	try {
		const challenge = await getCurrentChallenge();
		if (!challenge || challenge.status !== "open") return winError(400, "Die Challenge nimmt gerade keine Teamänderungen an.");
		const { participant, team } = await loadMyState(user.discordId);
		if (!participant) return winError(400, "Melde dich zuerst an.");

		if (parsed.data.action === "create") {
			const created = await createTeam({ challenge, participant, name: parsed.data.name, actor: user.name });
			return winJson({ ok: true, team: { name: created.name, joinCode: created.joinCode } });
		}
		if (parsed.data.action === "join") {
			if (!joinAllowed(user.discordId)) return winError(429, "Zu viele Versuche. Warte eine Minute.");
			const joined = await joinTeam({ challenge, participant, code: parsed.data.code, actor: user.name });
			return winJson({ ok: true, team: { name: joined.name } });
		}
		if (parsed.data.action === "leave") {
			await leaveTeam({ participant, actor: user.name });
			return winJson({ ok: true });
		}
		if (!team) return winError(400, "Du bist in keinem Team.");
		if (team.status !== "forming" && team.status !== "ready") return winError(400, "Euer Timer läuft schon, der Code wird nicht mehr gebraucht.");
		return winJson({ ok: true, joinCode: await regenerateJoinCode(team) });
	} catch (error) {
		return handleWinError(error, "Teamaktion fehlgeschlagen.");
	}
}
