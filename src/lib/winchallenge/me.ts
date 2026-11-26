/** The logged-in player's own view: sign-up state, team incl. join code, partner, Twitch link. */
import { getTwitchLink } from "@/lib/tournament-storage";
import { gamesDone } from "@/lib/winchallenge/actions";
import { skipLiveCheck, teamLiveState, twitchIdentities, type LiveState } from "@/lib/winchallenge/live";
import { getVisibleChallenge, getParticipantByDiscord, getTeam, listParticipants, listPayouts, syncParticipantTwitch } from "@/lib/winchallenge/store";
import { subTargetOf } from "@/lib/winchallenge/subs";
import { elapsedMs, clockRunning } from "@/lib/winchallenge/timer";
import type { WinChallenge, WinParticipant, WinPayout, WinSubTarget, WinTeam } from "@/lib/winchallenge/types";

export type MyPayout = WinPayout & { otherName: string; otherTwitch: string };

export type MyState = {
	serverNow: number;
	challenge: WinChallenge | null;
	twitch: { login: string; displayName: string; profileImageUrl: string } | null;
	participant: (Pick<WinParticipant, "id" | "discordName" | "twitchLogin" | "createdAt"> & { subTarget: WinSubTarget }) | null;
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
	const [challenge, link] = await Promise.all([getVisibleChallenge(), getTwitchLink(discordId).catch(() => null)]);
	const twitch = link ? { login: link.login, displayName: link.displayName, profileImageUrl: link.profileImageUrl ?? "" } : null;
	const empty: MyState = { serverNow, challenge, twitch, participant: null, team: null, payouts: { give: [], receive: [] } };
	if (!challenge) return { state: empty, participant: null, team: null };

	const participant = await getParticipantByDiscord(challenge.id, discordId);
	if (!participant) return { state: empty, participant: null, team: null };
	if (link && (link.twitchUserId !== participant.twitchId || link.login !== participant.twitchLogin)) {
		await syncParticipantTwitch(participant.id, link.twitchUserId, link.login);
	}

	const [team, all, payouts] = await Promise.all([
		participant.teamId ? getTeam(participant.teamId) : Promise.resolve(null),
		listParticipants(challenge.id),
		listPayouts(challenge.id),
	]);
	const byId = new Map(all.map((entry) => [entry.id, entry]));
	// Players are shown by their Twitch name everywhere outside admin.
	const { names } = await twitchIdentities(all);
	const nameOf = (id: string) => names.get(id) ?? byId.get(id)?.twitchLogin ?? "?";
	const members = team ? team.memberIds.map((id) => byId.get(id)).filter((entry): entry is WinParticipant => Boolean(entry)) : [];
	const named = (payout: WinPayout, otherId: string): MyPayout => ({
		...payout,
		otherName: nameOf(otherId),
		otherTwitch: byId.get(otherId)?.twitchLogin ?? "",
	});

	return {
		participant,
		team,
		state: {
			serverNow,
			challenge,
			twitch,
			participant: {
				id: participant.id,
				discordName: participant.discordName,
				twitchLogin: participant.twitchLogin,
				subTarget: subTargetOf(participant, all),
				createdAt: participant.createdAt,
			},
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
						elapsedMs: elapsedMs(team, serverNow, challenge),
						running: clockRunning(team, challenge),
						done: gamesDone(team, challenge.games),
						members: members.map((member) => ({ id: member.id, name: nameOf(member.id), twitch: member.twitchLogin })),
						live: skipLiveCheck() ? "live" : await teamLiveState(members).catch(() => "twitch-down" as const),
					}
				: null,
			payouts: {
				give: payouts.filter((payout) => payout.payerId === participant.id).map((payout) => named(payout, payout.recipientId)),
				receive: payouts.filter((payout) => payout.recipientId === participant.id).map((payout) => named(payout, payout.payerId)),
			},
		},
	};
}
