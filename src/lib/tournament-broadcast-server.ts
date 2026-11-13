import { getTournamentSettings } from "@/lib/tournament-settings";
import { getRosterPublicationStatus } from "@/lib/roster";
import { getMatchControlContext } from "@/lib/match-control";
import { getDraftState } from "@/lib/tournament-draft";
import { getAllChampions } from "@/lib/champion-pools";
import { swissStageToPotState } from "@/lib/swiss-live-pot";
import { publicBroadcastMatch, publicBroadcastDraft, broadcastEventIsPublic, type BroadcastSnapshot, type BroadcastDraft } from "@/lib/tournament-broadcast";

let cached: { until: number; value: Promise<BroadcastSnapshot> } | undefined;
const drafts = new Map<string, { until: number; value: Promise<BroadcastDraft> }>();

/** Coalesce OBS viewers; do not add Riot/Twitch calls per source or expose unpublished rosters. */
export function loadTournamentBroadcast(): Promise<BroadcastSnapshot> {
	if (cached && cached.until > Date.now()) return cached.value;
	const value = load()
		.then((snapshot) => {
			if (cached?.value === value) cached.until = Date.now() + 1500;
			return snapshot;
		})
		.catch((error) => {
			if (cached?.value === value) cached = undefined;
			throw error;
		});
	cached = { until: Infinity, value };
	return value;
}

async function load(): Promise<BroadcastSnapshot> {
	const [settings, publication] = await Promise.all([getTournamentSettings(), getRosterPublicationStatus()]);
	const base: BroadcastSnapshot = {
		version: 1,
		tournament: { id: settings.activeTournament.id, name: settings.activeTournament.name, mode: settings.activeTournament.mode },
		generatedAt: new Date().toISOString(),
		source: "live",
		published: publication.published,
		draftEnabled: settings.draftEnabled,
		teams: [],
		matches: [],
		draw: null,
		drawRevision: "",
		champion: null,
		standings: [],
		standingsFinal: false,
		selectedTeam: null,
		selectedMatch: null,
		draft: null,
	};
	if (!publication.published) return base;
	const control = await getMatchControlContext();
	base.teams = control.teams.map((team) => ({ id: team.id, key: team.storageKey ?? team.id, name: team.name, tag: team.tag ?? null, seed: team.seed }));
	base.matches = control.matches.map((match) => publicBroadcastMatch(match, base.teams));
	base.champion = control.stages?.champion?.name ?? null;
	const dayOne = control.stages?.dayOne;
	base.standings =
		dayOne?.swissStandings?.rows.map((row) => ({ name: row.name, rank: row.rank, wins: row.wins, losses: row.losses })) ??
		dayOne?.groups.flatMap((group) =>
			(group.standings?.rows ?? []).map((row) => ({ name: row.name, rank: row.rank, wins: row.wins, losses: row.losses, group: group.group }))
		) ??
		[];
	if (dayOne?.complete && Object.keys(dayOne.seeds).length && Object.values(dayOne.seeds).every(Boolean)) {
		const records = new Map(base.standings.map((row) => [row.name, row]));
		base.standings = Object.entries(dayOne.seeds)
			.map(([rank, name]) => ({ name: name!, rank: Number(rank), wins: records.get(name!)?.wins ?? 0, losses: records.get(name!)?.losses ?? 0 }))
			.sort((a, b) => a.rank - b.rank);
		base.standingsFinal = true;
	}
	const swiss = control.stages?.dayOne.swiss;
	if (swiss && base.teams.length === 8 && !swiss.rounds.some((round) => round.pairings.some((pair) => pair.bye))) {
		const pot = swissStageToPotState(swiss, base.teams);
		base.draw = {
			teams: pot.teams.map((team) => ({ key: team.key, name: team.name })),
			events: pot.events.map(broadcastEventIsPublic),
			rounds: pot.rounds.map((round) => ({
				round: round.round,
				complete: round.complete,
				pools: round.pools.map((pool) => ({
					record: pool.record,
					teamKeys: pool.teamKeys,
					slots: pool.slots,
					drawOrder: pool.drawOrder,
					complete: pool.complete,
					automatic: pool.automatic,
					blockedRematches: pool.blockedRematches,
					rematchApproved: pool.rematchApproved,
				})),
				pairings: round.pairings.map((pair) => ({
					id: pair.id,
					teamAKey: pair.teamAKey,
					teamBKey: pair.teamBKey,
					recordA: pair.recordA,
					recordB: pair.recordB,
					bye: false,
					winnerTeamKey: pair.winnerTeamKey,
				})),
			})),
		};
		base.drawRevision = swiss.updatedAt;
	}
	return base;
}

export async function loadBroadcastDraft(matchId: string): Promise<BroadcastDraft> {
	const existing = drafts.get(matchId);
	if (existing && existing.until > Date.now()) return existing.value;
	for (const [key, entry] of drafts) if (entry.until < Date.now()) drafts.delete(key);
	const value = Promise.all([getDraftState(matchId), getAllChampions().catch(() => [])]).then(([draft, champions]) => {
		const entry = drafts.get(matchId);
		if (entry?.value === value) entry.until = Date.now() + 1500;
		return publicBroadcastDraft(
			draft,
			champions.map((champion) => ({ id: champion.id, name: champion.name, image: champion.imageUrl }))
		);
	});
	drafts.set(matchId, { until: Infinity, value });
	try {
		return await value;
	} catch (error) {
		drafts.delete(matchId);
		throw error;
	}
}
