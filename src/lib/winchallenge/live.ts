/**
 * Stream rule (plan §4): one team member must be live on Twitch to start, resume or count progress.
 * The current Twitch link is read at check time, so a relink with a new login keeps working.
 */
import { getStreamsChecked } from "@/lib/twitch";
import { listTwitchLinksForDiscordIds } from "@/lib/tournament-storage";
import type { WinParticipant } from "@/lib/winchallenge/types";

export type LiveState = "live" | "offline" | "twitch-down";

/** Current Twitch login per participant id (falls back to the login stored at sign-up). */
export async function currentTwitchLogins(participants: WinParticipant[]): Promise<Map<string, string>> {
	const links = await listTwitchLinksForDiscordIds(participants.map((participant) => participant.discordId)).catch(() => []);
	const byDiscord = new Map(links.map((link) => [link.discordId, link.login]));
	return new Map(participants.map((participant) => [participant.id, (byDiscord.get(participant.discordId) ?? participant.twitchLogin).toLowerCase()]));
}

/** Live logins among the given participants, and whether Twitch answered at all. */
export async function liveStatus(participants: WinParticipant[]): Promise<{ live: Set<string>; logins: Map<string, string>; ok: boolean }> {
	const logins = await currentTwitchLogins(participants);
	const { streams, ok } = await getStreamsChecked([...logins.values()]);
	const live = new Set([...logins.entries()].filter(([, login]) => streams.has(login)).map(([id]) => id));
	return { live, logins, ok };
}

/** "live" when a member streams, "twitch-down" when Twitch did not answer (the action is then allowed). */
export async function teamLiveState(members: WinParticipant[]): Promise<LiveState> {
	if (members.length === 0) return "offline";
	const { live, ok } = await liveStatus(members);
	if (live.size > 0) return "live";
	return ok ? "offline" : "twitch-down";
}

/** Local test runs only: nobody is live there. Never honoured in production builds. */
export function skipLiveCheck(): boolean {
	return process.env.NODE_ENV !== "production" && process.env.WINCHALLENGE_SKIP_LIVE_CHECK === "1";
}
