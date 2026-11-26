/** The logged-in player's own view: sign-up state, team incl. join code, partner, Twitch link. */
import { getTwitchLink } from "@/lib/tournament-storage";
import { gamesDone } from "@/lib/winchallenge/actions";
import { teamLiveState, type LiveState } from "@/lib/winchallenge/live";
import { getCurrentChallenge, getParticipantByDiscord, getTeam, listParticipants, listPayouts, syncParticipantTwitch } from "@/lib/winchallenge/store";
import { elapsedMs, timerRunning } from "@/lib/winchallenge/timer";
import type { WinChallenge, WinParticipant, WinPayout, WinTeam } from "@/lib/winchallenge/types";

export type MyPayout = WinPayout & { otherName: string; otherTwitch: string };

export type MyState = {
	serverNow: number;
	challenge: WinChallenge | null;
	twitch: { login: string; displayName: string } | null;
	participant: Pick<WinParticipant, "id" | "discordName" | "twitchLogin" | "wishChannel" | "createdAt"> | null;
	team:
		| (Pick<WinTeam, "id" | "slug" | "name" | "joinCode" | "status" | "progress" | "currentGameId" | "finishedAt" | "finalMs" | "version"> & {
				elapsedMs: number;
				running: boolean;
				done: number;
				members: { id: string; name: string; twitch: string }[];
				live: LiveState;
		  })
		| null;
	payouts: { give: MyPayout[]; receive: MyPayout[] };
};

export async function loadMyState(discordId: string): Promise<{ state: MyState; participant: WinParticipant | null; team: WinTeam | null }> {
	const serverNow = Date.now();
	const [challenge, link] = await Promise.all([getCurrentChallenge(), getTwitchLink(discordId).catch(() => null)]);
	const twitch = link ? { login: link.login, displayName: link.displayName } : null;
	const empty: MyState = { serverNow, challenge, twitch, participant: null, team: null, payouts: { give: [], receive: [] } };
	if (!challenge) return { state: empty, participant: null, team: null };

	const participant = await getParticipantByDiscord(challenge.id, discordId);
	if (!participant) return { state: empty, participant: null, team: null };
	if (link && (link.twitchUserId !== participant.twitchId || link.login !== participant.twitchLogin)) {
		await syncParticipantTwitch(participant.id, link.twitchUserId, link.login);
	}

	const [team, all, payouts] = await Promise.all([participant.teamId ? getTeam(participant.teamId) : Promise.resolve(null), listParticipants(challenge.id), listPayouts(challenge.id)]);
	const byId = new Map(all.map((entry) => [entry.id, entry]));
	const members = team ? team.memberIds.map((id) => byId.get(id)).filter((entry): entry is WinParticipant => Boolean(entry)) : [];
	const named = (payout: WinPayout, otherId: string): MyPayout => ({ ...payout, otherName: byId.get(otherId)?.discordName ?? "?", otherTwitch: byId.get(otherId)?.twitchLogin ?? "" });

	return {
		participant,
		team,
		state: {
			serverNow,
			challenge,
			twitch,
			participant: { id: participant.id, discordName: participant.discordName, twitchLogin: participant.twitchLogin, wishChannel: participant.wishChannel, createdAt: participant.createdAt },
			team: team
				? {
						id: team.id,
						slug: team.slug,
						name: team.name,
						joinCode: team.joinCode,
						status: team.status,
						progress: team.progress,
						currentGameId: team.currentGameId,
						finishedAt: team.finishedAt,
						finalMs: team.finalMs,
						version: team.version,
						elapsedMs: elapsedMs(team, serverNow),
						running: team.status === "running" && timerRunning(team.segments),
						done: gamesDone(team, challenge.games),
						members: members.map((member) => ({ id: member.id, name: member.discordName, twitch: member.twitchLogin })),
						live: await teamLiveState(members).catch(() => "twitch-down" as const),
					}
				: null,
			payouts: {
				give: payouts.filter((payout) => payout.payerId === participant.id).map((payout) => named(payout, payout.recipientId)),
				receive: payouts.filter((payout) => payout.recipientId === participant.id).map((payout) => named(payout, payout.payerId)),
			},
		},
	};
}
