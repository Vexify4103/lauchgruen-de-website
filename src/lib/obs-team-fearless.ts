import { getAllChampions } from "@/lib/champion-pools";
import { lockedChampionsByTeam } from "@/lib/fearless";
import type { ControlMatch, MatchControlContext } from "@/lib/match-control";
import { getDraftState } from "@/lib/tournament-draft";
import type { TournamentTeam } from "@/lib/tournament-data";
import type { TournamentSettings } from "@/lib/tournament-settings";
import { teamMatchRecord } from "@/lib/tournament-team-records";
import type { ObsTeamResponse, OverlayMatch } from "@/app/api/tournament/obs/route";

/**
 * Overlay data for tournaments on the flexible engine (Swiss/groups + bracket).
 * Adds what the A-Z overlay never had: what is at stake for the team, the phase
 * of the live match, and the team's Fearless locks.
 */
export async function buildFlexibleObsResponse(team: TournamentTeam, control: MatchControlContext, settings: TournamentSettings): Promise<ObsTeamResponse> {
	const structure = settings.structure;
	const own = control.matches.filter((match) => match.teamAName === team.name || match.teamBName === team.name);
	const [wins, losses] = parseRecord(teamMatchRecord(team.name, control.matches));
	const decided = (match: ControlMatch) => match.status === "Finished" && match.scoreA !== undefined && match.scoreB !== undefined;
	const live = own.find((match) => match.status === "Live") ?? null;
	const next = own.find((match) => match.status !== "Finished" && match.status !== "Live" && match.teamAName && match.teamBName) ?? null;
	const recent = [...own].reverse().find(decided) ?? null;

	const toOverlay = (match: ControlMatch): OverlayMatch => {
		const selfIsA = match.teamAName === team.name;
		const opponent = (selfIsA ? match.teamBName : match.teamAName) ?? "TBD";
		return {
			id: match.id,
			opponent,
			opponentRecord: opponent === "TBD" ? undefined : teamMatchRecord(opponent, control.matches),
			scoreSelf: selfIsA ? match.scoreA : match.scoreB,
			scoreOpponent: selfIsA ? match.scoreB : match.scoreA,
			status: match.status,
			bracket: match.phase === "playoffs" ? (match.bracket ?? "Upper") : "Group",
			round: match.round,
			time: match.time,
		};
	};

	const currentMatch = live ? { ...toOverlay(live), phase: await livePhase(live.id) } : null;

	// Where the team stands and what the next result means for it.
	const seedEntry = Object.entries(control.stages?.dayOne.seeds ?? {}).find(([, name]) => name === team.name);
	const seed = seedEntry ? Number(seedEntry[0]) : null;
	const champion = control.stages?.champion ?? null;
	const playoffMatches = own.filter((match) => match.phase === "playoffs" && match.teamAName && match.teamBName);
	let stageLabel: string;
	let stakes: string | null = null;
	if (champion?.name === team.name) {
		stageLabel = "Playoffs";
		stakes = "Turniersieger";
	} else if (champion?.finalist === team.name) {
		stageLabel = "Playoffs";
		stakes = "Platz 2";
	} else if (playoffMatches.length > 0) {
		stageLabel = seed ? `Playoffs · Seed #${seed}` : "Playoffs";
		const lostLower = playoffMatches.some((match) => decided(match) && match.bracket === "Lower" && match.winner && match.winner !== team.name);
		const focus = live ?? next ?? (playoffMatches.at(-1) as ControlMatch);
		if (lostLower) stakes = "Ausgeschieden";
		else if (focus.bracket === "Grand") stakes = "Grand Final";
		else if (focus.bracket === "Lower") stakes = "Lower Bracket · eine Niederlage = raus";
		else stakes = "Upper Bracket";
	} else {
		const dayOne = structure.dayOneFormat;
		stageLabel = dayOne === "swiss" || dayOne === "swiss-elimination" ? "Swiss Stage" : dayOne === "groups" || dayOne === "gsl" ? `Gruppe ${team.group}` : "Tag 1";
		if (seed) stakes = `Playoff-Seed #${seed}`;
		else if (dayOne === "swiss-elimination") {
			const need = structure.swissWinsToAdvance;
			if (wins >= need) stakes = "Playoffs erreicht";
			else if (losses >= need) stakes = "Ausgeschieden";
			else if (wins === need - 1 && losses === need - 1) stakes = "Entscheidungsspiel";
			else if (wins === need - 1) stakes = "Ein Sieg bis Playoffs";
			else if (losses === need - 1) stakes = "Elimination Match";
		} else if (structure.advanceTeamCount >= control.teams.length) {
			stakes = "Bilanz entscheidet den Seed";
		}
	}

	// Fearless: every lock of the team, and the champions it played in its latest game.
	const locks = lockedChampionsByTeam(control.matches, settings.fearless.variant).get(team.name) ?? [];
	let lastPicks: string[] = [];
	let lastOpponent: string | null = null;
	for (const match of own) {
		const selfIsA = match.teamAName === team.name;
		const games = match.games?.length ? match.games : [{ teamAChampions: match.teamAChampions, teamBChampions: match.teamBChampions }];
		for (const game of games) {
			const picks = selfIsA ? game.teamAChampions : game.teamBChampions;
			if (picks?.length) {
				lastPicks = picks;
				lastOpponent = selfIsA ? match.teamBName : match.teamAName;
			}
		}
	}
	const images = lastPicks.length ? new Map((await getAllChampions()).map((champion) => [champion.name, champion.imageUrl])) : new Map<string, string>();

	return {
		team: { id: team.id, name: team.name, group: team.group, accent: team.accent, seed: team.seed },
		standing: { rank: 0, wins, losses, played: wins + losses, pointDiff: 0, pointsFor: 0 },
		groupSize: control.teams.length,
		currentMatch,
		nextMatch: next ? toOverlay(next) : null,
		recentResult: recent ? toOverlay(recent) : null,
		playoffSlot: null,
		stage: { label: stageLabel, stakes },
		fearless: {
			locked: locks.length,
			own: locks.filter((lock) => lock.source === "own").length,
			lastPicks: lastPicks.map((name) => ({ name, image: images.get(name) ?? null })),
			lastOpponent,
		},
	};
}

function parseRecord(record: string): [number, number] {
	const [wins, losses] = record.split(/[-–]/).map((value) => Number(value) || 0);
	return [wins ?? 0, losses ?? 0];
}

/** Champ select while the draft is open, in game once both rosters are locked. */
async function livePhase(matchId: string): Promise<"draft" | "game" | null> {
	try {
		const draft = await getDraftState(matchId);
		if (draft.rolesFinalizedAt) return "game";
		if (draft.actions.length > 0 || draft.readyBy.teamA || draft.readyBy.teamB) return "draft";
		return null;
	} catch {
		return null;
	}
}
