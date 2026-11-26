/**
 * Public view of the challenge: leaderboard page, team pages and overlays all read this shape.
 * Never contains Discord ids or join codes.
 */
import { gameProgress, gamesDone } from "@/lib/winchallenge/actions";
import { liveStatus } from "@/lib/winchallenge/live";
import { rankTeams } from "@/lib/winchallenge/ranking";
import { getCurrentChallenge, listEvents, listParticipants, listPayouts, listTeams, payersFor } from "@/lib/winchallenge/store";
import { timerRunning } from "@/lib/winchallenge/timer";
import type { WinChallenge, WinGame, WinTeamStatus } from "@/lib/winchallenge/types";

export type PublicMember = { name: string; twitch: string; live: boolean };

export type PublicGameState = { id: string; count: number; tries: number; doneAt: string | null };

export type PublicTeam = {
	slug: string;
	name: string;
	status: WinTeamStatus;
	rank: number;
	done: number;
	total: number;
	/** Running time at `serverNow`; add the time since then while `running`. */
	elapsedMs: number;
	running: boolean;
	finishedAt: string | null;
	members: PublicMember[];
	currentGameId: string | null;
	games: PublicGameState[];
};

export type PublicFeedEntry = { at: string; team: string; text: string };

export type PublicChallenge = {
	serverNow: number;
	challenge: Pick<WinChallenge, "name" | "slug" | "startAt" | "status" | "signupOpen" | "split" | "games" | "endedAt"> | null;
	teams: PublicTeam[];
	participants: number;
	soloParticipants: number;
	pot: number;
	payouts: { total: number; done: number };
	feed: PublicFeedEntry[];
};

const FEED_KINDS = ["game-done", "team-finished", "team-create", "challenge-ended"];

function feedText(kind: string, gameTitle: string | undefined): string {
	if (kind === "game-done") return `hat ${gameTitle ?? "ein Spiel"} geschafft`;
	if (kind === "team-finished") return "ist fertig";
	if (kind === "team-create") return "ist dabei";
	return "Challenge beendet";
}

export async function buildPublicChallenge(): Promise<PublicChallenge> {
	const serverNow = Date.now();
	const challenge = await getCurrentChallenge();
	if (!challenge) return { serverNow, challenge: null, teams: [], participants: 0, soloParticipants: 0, pot: 0, payouts: { total: 0, done: 0 }, feed: [] };

	const [teams, participants, events, payouts] = await Promise.all([
		listTeams(challenge.id),
		listParticipants(challenge.id),
		listEvents(challenge.id, { kinds: FEED_KINDS, limit: 20 }),
		listPayouts(challenge.id),
	]);
	const members = participants.filter((participant) => participant.teamId);
	const { live, logins } = await liveStatus(members).catch(() => ({ live: new Set<string>(), logins: new Map<string, string>(), ok: false }));
	const byId = new Map(participants.map((participant) => [participant.id, participant]));
	const teamName = new Map(teams.map((team) => [team.id, team.name]));
	const gameTitle = new Map(challenge.games.map((game: WinGame) => [game.id, game.title]));

	const ranked = rankTeams(teams, challenge.games, serverNow);
	return {
		serverNow,
		challenge: {
			name: challenge.name,
			slug: challenge.slug,
			startAt: challenge.startAt,
			status: challenge.status,
			signupOpen: challenge.signupOpen,
			split: challenge.split,
			games: challenge.games,
			endedAt: challenge.endedAt,
		},
		teams: ranked.map(({ team, rank, elapsedMs }) => ({
			slug: team.slug,
			name: team.name,
			status: team.status,
			rank,
			done: gamesDone(team, challenge.games),
			total: challenge.games.length,
			elapsedMs,
			running: team.status === "running" && timerRunning(team.segments),
			finishedAt: team.finishedAt ?? null,
			members: team.memberIds.map((id) => ({
				name: byId.get(id)?.discordName ?? "?",
				twitch: logins.get(id) ?? byId.get(id)?.twitchLogin ?? "",
				live: live.has(id),
			})),
			currentGameId: team.currentGameId ?? null,
			games: challenge.games.map((game) => {
				const progress = gameProgress(team, game.id);
				return { id: game.id, count: progress.count, tries: progress.tries, doneAt: progress.doneAt ?? null };
			}),
		})),
		participants: participants.length,
		soloParticipants: participants.filter((participant) => !participant.teamId).length,
		pot: payersFor(teams).length,
		payouts: { total: payouts.length, done: payouts.filter((payout) => payout.status === "confirmed").length },
		feed: events
			.filter((event) => event.kind === "challenge-ended" || (event.teamId && teamName.has(event.teamId)))
			.map((event) => ({ at: event.at, team: event.teamId ? (teamName.get(event.teamId) ?? "") : "", text: feedText(event.kind, event.gameId ? gameTitle.get(event.gameId) : undefined) })),
	};
}
