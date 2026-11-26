/**
 * POST /api/winchallenge/control: a team member presses a button.
 * { action: start|pause|resume|done|undo|plus|minus|reset|current|give-up, gameId? }
 * Start, resume, done, plus and reset need one member live on Twitch (plan §4).
 */
import { z } from "zod";
import { LIVE_REQUIRED_ACTIONS, type WinTeamAction } from "@/lib/winchallenge/actions";
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { teamLiveState } from "@/lib/winchallenge/live";
import { controlTeam, getVisibleChallenge, getParticipantByDiscord, getTeam, listParticipants } from "@/lib/winchallenge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gameId = z.string().min(1).max(60);
const schema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("start") }),
	z.object({ action: z.literal("pause") }),
	z.object({ action: z.literal("resume") }),
	z.object({ action: z.literal("give-up") }),
	z.object({ action: z.literal("current"), gameId: gameId.nullable() }),
	z.object({ action: z.enum(["done", "undo", "plus", "minus", "reset"]), gameId }),
]);

export async function POST(request: Request) {
	const user = await currentUser();
	if (!user) return winError(401, "Bitte mit Discord anmelden.");
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return winError(400, "Ungültige Aktion.");
	const action = parsed.data as WinTeamAction;
	try {
		const challenge = await getVisibleChallenge();
		if (!challenge) return winError(404, "Aktuell gibt es keine Challenge.");
		if (challenge.status !== "open") return winError(400, "Die Challenge ist beendet.");
		const participant = await getParticipantByDiscord(challenge.id, user.discordId);
		const team = participant?.teamId ? await getTeam(participant.teamId) : null;
		if (!participant || !team) return winError(403, "Du bist in keinem Team.");

		let liveCheck: "live" | "offline" | "twitch-down" | undefined;
		if (action.action === "start" && Date.now() < new Date(challenge.startAt).getTime()) {
			return winError(400, "Start ist erst ab dem offiziellen Startzeitpunkt möglich.", "too-early");
		}
		// Local test runs only: nobody is live there. Never honoured in production builds.
		const skipLive = process.env.NODE_ENV !== "production" && process.env.WINCHALLENGE_SKIP_LIVE_CHECK === "1";
		if (LIVE_REQUIRED_ACTIONS.has(action.action) && !skipLive) {
			const members = (await listParticipants(challenge.id)).filter((entry) => team.memberIds.includes(entry.id));
			liveCheck = await teamLiveState(members);
			if (liveCheck === "offline") return winError(400, "Einer von euch muss auf Twitch live sein.", "not-live");
		}
		const updated = await controlTeam({ team, challenge, action, actor: user.name, liveCheck });
		return winJson({ ok: true, status: updated.status, version: updated.version });
	} catch (error) {
		return handleWinError(error, "Aktion fehlgeschlagen.");
	}
}
