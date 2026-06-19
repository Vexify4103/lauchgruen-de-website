import { playoffMatches, type GroupMatch, type PlayoffMatch, type TeamSlot, type TournamentTeam } from "@/lib/tournament-data";
import type { StoredTournamentMatch } from "@/lib/tournament-storage";

export type { TeamSlot };

export type TeamStanding = {
	team: TournamentTeam;
	played: number;
	wins: number;
	losses: number;
	pointsFor: number;
	pointsAgainst: number;
	pointDiff: number;
	headToHeadWins: number;
	headToHeadTimedWins: number;
	headToHeadWinDurationSeconds: number;
	avgWinTimeSeconds: number | null;
	avgRecordedWinTimeSeconds: number | null;
	rank: number;
	tiebreakerRequired: boolean;
};

export type GroupStandings = {
	A: TeamStanding[];
	B: TeamStanding[];
};

export type ResolvedPlayoffMatch = PlayoffMatch & {
	teamAName: string | null;
	teamBName: string | null;
	teamALabel: string;
	teamBLabel: string;
	winner: string | null;
};

export function slotLabel(slot: TeamSlot): string {
	switch (slot.kind) {
		case "team":
			return slot.name;
		case "groupSeed":
			return groupPlacementLabel(slot.seed);
		case "matchWinner":
			return `Winner ${slot.matchId.toUpperCase()}`;
		case "matchLoser":
			return `Loser ${slot.matchId.toUpperCase()}`;
	}
}

function groupPlacementLabel(seed: number): string {
	const placements: Record<number, string> = {
		1: "Gruppe A #1",
		2: "Gruppe B #1",
		3: "Gruppe A #2",
		4: "Gruppe B #2",
		5: "Gruppe A #3",
		6: "Gruppe B #3",
		7: "Gruppe A #4",
		8: "Gruppe B #4",
	};
	return placements[seed] ?? `Seed #${seed}`;
}

type StoredMap = Record<string, StoredTournamentMatch>;

export function computeGroupStandings(state: StoredMap, teams: TournamentTeam[], groupMatches: GroupMatch[]): GroupStandings {
	const byGroup: GroupStandings = { A: [], B: [] };

	for (const group of ["A", "B"] as const) {
		const groupTeams = teams.filter((team) => team.group === group);
		const standings: TeamStanding[] = groupTeams.map((team) => ({
			team,
			played: 0,
			wins: 0,
			losses: 0,
			pointsFor: 0,
			pointsAgainst: 0,
			pointDiff: 0,
			headToHeadWins: 0,
			headToHeadTimedWins: 0,
			headToHeadWinDurationSeconds: 0,
			avgWinTimeSeconds: null,
			avgRecordedWinTimeSeconds: null,
			rank: 0,
			tiebreakerRequired: false,
		}));
		const byName = new Map(standings.map((s) => [s.team.name, s]));

		const matches: GroupMatch[] = groupMatches.filter((m) => m.group === group);
		const h2h = new Map<string, Map<string, number>>(); // winnerName → loserName → wins
		const h2hDurations = new Map<string, Map<string, number[]>>();
		const winDurations = new Map<string, number[]>();

		for (const match of matches) {
			const stored = state[match.id];
			if (!stored || stored.status !== "Finished" || stored.scoreA === undefined || stored.scoreB === undefined) {
				continue;
			}

			const a = byName.get(match.teamA);
			const b = byName.get(match.teamB);
			if (!a || !b) continue;

			a.played += 1;
			b.played += 1;
			a.pointsFor += stored.scoreA;
			a.pointsAgainst += stored.scoreB;
			b.pointsFor += stored.scoreB;
			b.pointsAgainst += stored.scoreA;

			if (stored.scoreA > stored.scoreB) {
				a.wins += 1;
				b.losses += 1;
				addH2H(h2h, match.teamA, match.teamB);
				if (stored.gameDurationSeconds !== undefined) {
					addH2HDuration(h2hDurations, match.teamA, match.teamB, stored.gameDurationSeconds);
					addWinDuration(winDurations, match.teamA, stored.gameDurationSeconds);
				}
			} else if (stored.scoreB > stored.scoreA) {
				b.wins += 1;
				a.losses += 1;
				addH2H(h2h, match.teamB, match.teamA);
				if (stored.gameDurationSeconds !== undefined) {
					addH2HDuration(h2hDurations, match.teamB, match.teamA, stored.gameDurationSeconds);
					addWinDuration(winDurations, match.teamB, stored.gameDurationSeconds);
				}
			}
		}

		for (const standing of standings) {
			standing.pointDiff = standing.pointsFor - standing.pointsAgainst;
			const tiedTeams = standings.filter((other) => other.wins === standing.wins);
			standing.headToHeadWins = tiedTeams.reduce(
				(wins, opponent) => (opponent.team.name === standing.team.name ? wins : wins + (h2h.get(standing.team.name)?.get(opponent.team.name) ?? 0)),
				0
			);
			const directWinDurations = tiedTeams.flatMap((opponent) =>
				opponent.team.name === standing.team.name ? [] : (h2hDurations.get(standing.team.name)?.get(opponent.team.name) ?? [])
			);
			standing.headToHeadTimedWins = directWinDurations.length;
			standing.headToHeadWinDurationSeconds = directWinDurations.reduce((total, seconds) => total + seconds, 0);
			standing.avgWinTimeSeconds =
				standing.headToHeadWins > 0 && standing.headToHeadTimedWins === standing.headToHeadWins ? standing.headToHeadWinDurationSeconds / standing.headToHeadWins : null;
			const recordedWins = winDurations.get(standing.team.name) ?? [];
			standing.avgRecordedWinTimeSeconds =
				recordedWins.length > 0 ? recordedWins.reduce((total, seconds) => total + seconds, 0) / recordedWins.length : null;
		}

		standings.sort((a, b) => {
			if (b.wins !== a.wins) return b.wins - a.wins;
			if (b.headToHeadWins !== a.headToHeadWins) {
				return b.headToHeadWins - a.headToHeadWins;
			}
			if (a.avgWinTimeSeconds !== b.avgWinTimeSeconds) {
				if (a.avgWinTimeSeconds === null) return 1;
				if (b.avgWinTimeSeconds === null) return -1;
				return a.avgWinTimeSeconds - b.avgWinTimeSeconds;
			}
			return a.team.name.localeCompare(b.team.name);
		});

		const groupComplete = standings.every((standing) => standing.played === Math.max((groupTeams.length - 1) * 2, 0));

		for (const standing of standings) {
			const tiedTeams = standings.filter(
				(other) => other.team.name !== standing.team.name && other.wins === standing.wins && other.headToHeadWins === standing.headToHeadWins
			);
			standing.tiebreakerRequired =
				groupComplete &&
				tiedTeams.some((other) => standing.avgWinTimeSeconds === null || other.avgWinTimeSeconds === null || standing.avgWinTimeSeconds === other.avgWinTimeSeconds);
		}

		standings.forEach((s, i) => (s.rank = i + 1));

		byGroup[group] = standings;
	}

	return byGroup;
}

function addH2H(table: Map<string, Map<string, number>>, winner: string, loser: string) {
	let row = table.get(winner);
	if (!row) {
		row = new Map();
		table.set(winner, row);
	}
	row.set(loser, (row.get(loser) ?? 0) + 1);
}

function addH2HDuration(table: Map<string, Map<string, number[]>>, winner: string, loser: string, durationSeconds: number) {
	let row = table.get(winner);
	if (!row) {
		row = new Map();
		table.set(winner, row);
	}
	const durations = row.get(loser) ?? [];
	durations.push(durationSeconds);
	row.set(loser, durations);
}

function addWinDuration(table: Map<string, number[]>, winner: string, durationSeconds: number) {
	const durations = table.get(winner) ?? [];
	durations.push(durationSeconds);
	table.set(winner, durations);
}

/**
 * Maps seeds #1..#6 to team names, OR null when the underlying group
 * standings aren't determined yet (group still in progress).
 */
export function computeSeeds(standings: GroupStandings): Record<number, string | null> {
	const allGroupMatchesFinished = (group: "A" | "B") => {
		const expectedMatchesPerTeam = Math.max((standings[group].length - 1) * 2, 0);
		return (
			standings[group].length >= 3 &&
			standings[group].every((standing) => standing.played === expectedMatchesPerTeam) &&
			standings[group].every((standing) => !standing.tiebreakerRequired)
		);
	};

	const a1 = allGroupMatchesFinished("A") ? (standings.A[0]?.team.name ?? null) : null;
	const a2 = allGroupMatchesFinished("A") ? (standings.A[1]?.team.name ?? null) : null;
	const a3 = allGroupMatchesFinished("A") ? (standings.A[2]?.team.name ?? null) : null;
	const a4 = allGroupMatchesFinished("A") ? (standings.A[3]?.team.name ?? null) : null;
	const b1 = allGroupMatchesFinished("B") ? (standings.B[0]?.team.name ?? null) : null;
	const b2 = allGroupMatchesFinished("B") ? (standings.B[1]?.team.name ?? null) : null;
	const b3 = allGroupMatchesFinished("B") ? (standings.B[2]?.team.name ?? null) : null;
	const b4 = allGroupMatchesFinished("B") ? (standings.B[3]?.team.name ?? null) : null;

	return {
		1: a1,
		2: b1,
		3: a2,
		4: b2,
		5: a3,
		6: b3,
		7: a4,
		8: b4,
	};
}

export function resolvePlayoffMatches(state: StoredMap, teams: TournamentTeam[], groupMatches: GroupMatch[]): ResolvedPlayoffMatch[] {
	const standings = computeGroupStandings(state, teams, groupMatches);
	const seeds = computeSeeds(standings);

	// Memoized resolver — playoff slots can reference each other transitively.
	const resolved = new Map<string, ResolvedPlayoffMatch>();

	function resolveSlot(slot: TeamSlot): string | null {
		switch (slot.kind) {
			case "team":
				return slot.name;
			case "groupSeed":
				return seeds[slot.seed] ?? null;
			case "matchWinner": {
				const m = resolveMatch(slot.matchId);
				return m?.winner ?? null;
			}
			case "matchLoser": {
				const m = resolveMatch(slot.matchId);
				if (!m) return null;
				if (!m.winner) return null;
				// The loser is whichever of teamAName / teamBName isn't the winner.
				if (m.teamAName && m.teamAName !== m.winner) return m.teamAName;
				if (m.teamBName && m.teamBName !== m.winner) return m.teamBName;
				return null;
			}
		}
	}

	function resolveMatch(id: string): ResolvedPlayoffMatch | undefined {
		if (resolved.has(id)) return resolved.get(id);
		const base = playoffMatches.find((m) => m.id === id);
		if (!base) return undefined;
		const stored = state[id];
		const teamAName = resolveSlot(base.teamA);
		const teamBName = resolveSlot(base.teamB);
		const teamsResolved = Boolean(teamAName && teamBName);

		let winner: string | null = null;
		if (stored?.scoreA !== undefined && stored?.scoreB !== undefined && stored.scoreA !== stored.scoreB && teamAName && teamBName) {
			winner = stored.scoreA > stored.scoreB ? teamAName : teamBName;
		}

		const out: ResolvedPlayoffMatch = {
			...base,
			teamAName,
			teamBName,
			teamALabel: teamAName ?? slotLabel(base.teamA),
			teamBLabel: teamBName ?? slotLabel(base.teamB),
			scoreA: stored?.scoreA,
			scoreB: stored?.scoreB,
			status: !teamsResolved ? "Locked" : stored?.status && stored.status !== "Locked" ? stored.status : "Scheduled",
			winner,
		};
		resolved.set(id, out);
		return out;
	}

	for (const m of playoffMatches) resolveMatch(m.id);
	return playoffMatches.map((m) => resolved.get(m.id)!);
}

/**
 * Computes the canonical winner of any match (group OR playoff) for use by
 * the API on save — so admins never type winner names.
 */
export function deriveWinner(
	matchId: string,
	scoreA: number | undefined,
	scoreB: number | undefined,
	state: StoredMap,
	teams: TournamentTeam[],
	groupMatches: GroupMatch[]
): string | null {
	if (scoreA === undefined || scoreB === undefined) return null;
	if (scoreA === scoreB) return null;

	const group = groupMatches.find((m) => m.id === matchId);
	if (group) {
		return scoreA > scoreB ? group.teamA : group.teamB;
	}

	// Playoff — resolve teamA / teamB names at this point in time.
	const playoff = playoffMatches.find((m) => m.id === matchId);
	if (!playoff) return null;

	const trial: StoredMap = {
		...state,
		[matchId]: { ...(state[matchId] ?? { id: matchId }), scoreA, scoreB },
	};
	const resolved = resolvePlayoffMatches(trial, teams, groupMatches);
	const r = resolved.find((m) => m.id === matchId);
	if (!r || !r.teamAName || !r.teamBName) return null;
	return scoreA > scoreB ? r.teamAName : r.teamBName;
}
