/**
 * Decides whether a parsed replay belongs to a tournament match. The proof is the players: a replay
 * only fits when its two sides are the two rosters of that match. The champions are checked against
 * the custom champ select as a second, independent signal.
 */
import { championIdentity } from "@/lib/champion-roles";
import type { ReplayPlayer, ReplaySummary, ReplayTeam } from "@/lib/rofl";

export type MatchSide = "teamA" | "teamB";
export type RosterEntry = { riotId: string; puuid?: string };
export type ReplayRoster = { name: string; players: RosterEntry[] };

export type ReplayVerdict = "ok" | "review" | "reject";

export type ReplayEvaluation = {
	verdict: ReplayVerdict;
	/** Which match team played on which replay side; null if the replay could not be attributed. */
	sideOf: Record<ReplayTeam, MatchSide | null>;
	winner: MatchSide | null;
	blueTeam: MatchSide | null;
	matchedPlayers: number;
	unknownPlayers: string[];
	championsMatchDraft: boolean | null;
	problems: string[];
	/** Champions per match team in lane order (top, jungle, mid, bot, support). */
	champions: Record<MatchSide, string[]>;
};

/** Fewer recognised players than this and the replay is rejected; 8 or 9 of 10 go to staff review. */
export const MIN_MATCHED_PLAYERS = 8;
const LANE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function riotKey(value: string) {
	return value.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

function rosterIndex(roster: ReplayRoster) {
	return {
		puuids: new Set(roster.players.map((player) => player.puuid).filter((puuid): puuid is string => Boolean(puuid))),
		riotIds: new Set(roster.players.map((player) => riotKey(player.riotId))),
	};
}

function belongsTo(player: ReplayPlayer, index: ReturnType<typeof rosterIndex>) {
	// PUUIDs survive Riot ID changes; the Riot ID is the fallback for manual entries without one.
	if (player.puuid && index.puuids.has(player.puuid)) return true;
	return index.riotIds.has(riotKey(`${player.riotIdName}#${player.riotIdTag}`));
}

function laneOrder(players: ReplayPlayer[]) {
	return [...players].sort((a, b) => {
		const first = LANE_ORDER.indexOf(a.position);
		const second = LANE_ORDER.indexOf(b.position);
		return (first < 0 ? 9 : first) - (second < 0 ? 9 : second);
	});
}

function sameChampions(replay: string[], draft: string[]) {
	const left = replay.map(championIdentity).sort();
	const right = draft.map(championIdentity).sort();
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function evaluateReplay(input: {
	replay: ReplaySummary;
	teamA: ReplayRoster;
	teamB: ReplayRoster;
	/** Blue side of the game the replay is for. */
	blueSide: MatchSide;
	/** Champions locked in the custom champ select for this game; empty when none were drafted. */
	draft: Record<MatchSide, string[]>;
	/** Games of this series that are already recorded, oldest first. */
	previousGames?: Array<Record<MatchSide, string[]>>;
}): ReplayEvaluation {
	const problems: string[] = [];
	const indexes = { teamA: rosterIndex(input.teamA), teamB: rosterIndex(input.teamB) };
	const bySide: Record<ReplayTeam, ReplayPlayer[]> = {
		100: input.replay.players.filter((player) => player.team === 100),
		200: input.replay.players.filter((player) => player.team === 200),
	};
	const unknownPlayers: string[] = [];
	let matchedPlayers = 0;
	const sideOf: Record<ReplayTeam, MatchSide | null> = { 100: null, 200: null };

	for (const replayTeam of [100, 200] as const) {
		const counts = { teamA: 0, teamB: 0 };
		for (const player of bySide[replayTeam]) {
			if (belongsTo(player, indexes.teamA)) counts.teamA += 1;
			else if (belongsTo(player, indexes.teamB)) counts.teamB += 1;
			else unknownPlayers.push(`${player.riotIdName}#${player.riotIdTag}`);
		}
		// A side belongs to the match team that holds the majority of its players.
		const leader: MatchSide | null = counts.teamA > counts.teamB ? "teamA" : counts.teamB > counts.teamA ? "teamB" : null;
		sideOf[replayTeam] = leader;
		matchedPlayers += leader ? counts[leader] : 0;
		const strangers = bySide[replayTeam].length - (leader ? counts[leader] : 0);
		if (leader && strangers > 0) problems.push(`${strangers} Spieler auf ${replayTeam === 100 ? "Blau" : "Rot"} gehören nicht zu ${input[leader].name}.`);
	}

	if (input.replay.players.length !== 10) problems.push(`Die Replay enthält ${input.replay.players.length} statt 10 Spieler.`);
	const attributed = Boolean(sideOf[100] && sideOf[200] && sideOf[100] !== sideOf[200]);
	if (!attributed) problems.unshift("Die Replay lässt sich nicht eindeutig den beiden Teams dieses Matches zuordnen.");
	if (unknownPlayers.length) problems.push(`Unbekannte Spieler: ${unknownPlayers.join(", ")}.`);

	const winner = attributed && input.replay.winningTeam ? sideOf[input.replay.winningTeam] : null;
	if (attributed && !winner) problems.push("Der Sieger lässt sich aus der Replay nicht eindeutig lesen.");
	const blueTeam = attributed ? sideOf[100] : null;
	if (blueTeam && blueTeam !== input.blueSide) problems.push(`Laut Replay spielte ${input[blueTeam].name} auf Blau, geplant war ${input[input.blueSide].name}.`);

	const champions: Record<MatchSide, string[]> = { teamA: [], teamB: [] };
	for (const replayTeam of [100, 200] as const) {
		const side = sideOf[replayTeam];
		if (side && attributed) champions[side] = laneOrder(bySide[replayTeam]).map((player) => player.champion);
	}
	let championsMatchDraft: boolean | null = null;
	if (attributed && input.draft.teamA.length && input.draft.teamB.length) {
		championsMatchDraft = sameChampions(champions.teamA, input.draft.teamA) && sameChampions(champions.teamB, input.draft.teamB);
		if (!championsMatchDraft) problems.push("Die Champions in der Replay passen nicht zum Champ Select dieses Spiels.");
	}
	// In a series a late replay of an earlier game must never count for the current one.
	const previousGames = input.previousGames ?? [];
	const earlierGame = attributed
		? previousGames.findIndex((game) => game.teamA.length > 0 && sameChampions(champions.teamA, game.teamA) && sameChampions(champions.teamB, game.teamB))
		: -1;
	if (earlierGame >= 0) problems.unshift(`Diese Replay gehört zu Spiel ${earlierGame + 1}, das bereits eingetragen ist.`);
	else if (attributed && previousGames.length > 0 && championsMatchDraft === null) {
		problems.push("Für dieses Spiel ist noch kein Champ Select gespeichert. Bitte prüfen, ob die Replay zum aktuellen Spiel gehört.");
	}

	const verdict: ReplayVerdict =
		!attributed || !winner || matchedPlayers < MIN_MATCHED_PLAYERS || earlierGame >= 0 ? "reject" : problems.length ? "review" : "ok";
	return { verdict, sideOf, winner, blueTeam, matchedPlayers, unknownPlayers, championsMatchDraft, problems, champions };
}

/** Same game uploaded twice (different file bytes): same players and same length. */
export function replayFingerprint(replay: ReplaySummary) {
	const players = replay.players
		.map((player) => player.puuid || `${player.riotIdName}#${player.riotIdTag}`)
		.sort()
		.join(",");
	return `${replay.durationSeconds}:${players}`;
}
