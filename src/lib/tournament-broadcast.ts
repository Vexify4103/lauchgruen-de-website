import type { ControlMatch } from "@/lib/match-control";
import type { TournamentDraftState } from "@/lib/tournament-draft-shared";
import type { SwissPotState, PotEvent, PotPool } from "@/lib/swiss-pot-draw";

export const BROADCAST_SCENES = ["swiss-draw", "tournament-board", "match-bar", "tournament-waiting", "champ-select"] as const;
export type BroadcastScene = (typeof BROADCAST_SCENES)[number];
export const isBroadcastScene = (value: string): value is BroadcastScene => BROADCAST_SCENES.some((scene) => scene === value);
export type BroadcastTeam = { id: string; key: string; name: string; tag: string | null; seed: number };

/** Match the existing /obs/tournament team selector; retain early broadcast storage-key links as a fallback. */
export function resolveBroadcastTeam(teams: BroadcastTeam[], selector: string): BroadcastTeam | null {
	return teams.find((team) => team.id === selector) ?? teams.find((team) => team.key === selector) ?? null;
}

export type BroadcastMatch = {
	id: string;
	phase: string;
	bracket: string | null;
	round: string;
	time: string;
	teamA: BroadcastTeam | null;
	teamB: BroadcastTeam | null;
	labelA: string;
	labelB: string;
	status: string;
	scoreA: number | null;
	scoreB: number | null;
	bestOf: number;
	blueSide: "teamA" | "teamB";
	casted: boolean;
};
export type BroadcastChampion = { id: string; name: string; image: string | null };
export type BroadcastDraft = {
	picksA: BroadcastChampion[];
	picksB: BroadcastChampion[];
	bansA: BroadcastChampion[];
	bansB: BroadcastChampion[];
	readyA: boolean;
	readyB: boolean;
	finalized: boolean;
};
export type BroadcastSnapshot = {
	version: 1;
	tournament: { id: string; name: string; mode: string };
	generatedAt: string;
	source: "live" | "demo" | "sandbox";
	published: boolean;
	draftEnabled: boolean;
	teams: BroadcastTeam[];
	matches: BroadcastMatch[];
	draw: SwissPotState | null;
	drawRevision: string;
	champion: string | null;
	standings: { name: string; rank: number; wins: number; losses: number; group?: string }[];
	standingsFinal: boolean;
	selectedTeam: BroadcastTeam | null;
	selectedMatch: BroadcastMatch | null;
	draft: BroadcastDraft | null;
};

/** Explicit allowlist: never serialize ControlMatch, player identities, notes, or raw draft documents. */
export function publicBroadcastMatch(match: ControlMatch, teams: BroadcastTeam[]): BroadcastMatch {
	return {
		id: match.id,
		phase: match.phase,
		bracket: match.bracket ?? null,
		round: match.round,
		time: match.time,
		teamA: teams.find((team) => team.name === match.teamAName) ?? null,
		teamB: teams.find((team) => team.name === match.teamBName) ?? null,
		labelA: match.teamALabel,
		labelB: match.teamBLabel,
		status: match.status,
		scoreA: match.scoreA ?? null,
		scoreB: match.scoreB ?? null,
		bestOf: match.bestOf,
		blueSide: match.blueSide,
		casted: match.isCasted === true,
	};
}

export function publicBroadcastDraft(draft: TournamentDraftState, champions: BroadcastChampion[]): BroadcastDraft {
	// Drafts store the display name ("Wukong", "Kai'Sa"); older data may hold the Data Dragon id ("MonkeyKing").
	const image = new Map(champions.flatMap((champion) => [[champion.id, champion] as const, [champion.name, champion] as const]));
	const locked = (side: "teamA" | "teamB", kind: "pick" | "ban") =>
		draft.actions
			.filter((action) => action.side === side && action.kind === kind && action.lockedAt && !action.skipped)
			.map((action) => image.get(action.champion) ?? { id: action.champion, name: action.champion, image: null });
	return {
		picksA: locked("teamA", "pick"),
		picksB: locked("teamB", "pick"),
		bansA: locked("teamA", "ban"),
		bansB: locked("teamB", "ban"),
		readyA: Boolean(draft.readyBy.teamA),
		readyB: Boolean(draft.readyBy.teamB),
		finalized: Boolean(draft.rolesFinalizedAt),
	};
}

export function selectBroadcastMatch(matches: BroadcastMatch[], team: BroadcastTeam | null, matchId?: string): BroadcastMatch | null {
	const relevant = matches.filter((match) => !team || match.teamA?.key === team.key || match.teamB?.key === team.key);
	if (matchId) return relevant.find((match) => match.id === matchId) ?? null;
	const active = relevant.filter((match) => match.teamA && match.teamB);
	const casted = active.filter((match) => match.casted && match.status !== "Finished" && match.status !== "Locked");
	const preferred = !team && casted.length ? casted : active;
	return (
		preferred.find((match) => match.status === "Live") ??
		preferred.find((match) => match.status === "Pending") ??
		preferred.find((match) => match.status === "Scheduled") ??
		[...active].reverse().find((match) => match.status === "Finished") ??
		null
	);
}

export type BroadcastReveal = { id: string; round: number; record: string; slot: number; assignedSlot: number; winner: string; candidates: { key: string; name: string }[] };

/** New events only. First connection, resets, tournament switches and history repairs never replay old draws. */
export function broadcastDrawReveals(before: BroadcastSnapshot | null, after: BroadcastSnapshot): BroadcastReveal[] {
	if (!before || before.tournament.id !== after.tournament.id || before.source !== after.source || !before.draw || !after.draw) return [];
	const previous = before.draw.events;
	const events = after.draw.events;
	if (events.length < previous.length || previous.some((event, index) => JSON.stringify(event) !== JSON.stringify(events[index]))) return [];
	return events.slice(previous.length).flatMap((event, offset) => {
		if (!event.teamKey || event.fromSlot === undefined || event.toSlot === undefined) return [];
		const pool = after.draw!.rounds.find((round) => round.round === event.round)?.pools.find((pool) => pool.record === event.record);
		if (!pool) return [];
		const position = pool.drawOrder.indexOf(event.teamKey);
		if (position < 0) return [];
		const already = new Set(pool.drawOrder.slice(0, position));
		return [
			{
				id: `${after.tournament.id}:${event.round}:${previous.length + offset}:${event.teamKey}`,
				round: event.round,
				record: event.record,
				slot: event.fromSlot,
				assignedSlot: event.toSlot,
				winner: event.teamKey,
				candidates: after.draw!.teams.filter((team) => pool.teamKeys.includes(team.key) && !already.has(team.key)),
			},
		];
	});
}

export function broadcastHistoryContinues(before: BroadcastSnapshot | null, after: BroadcastSnapshot): boolean {
	return Boolean(
		before &&
		before.tournament.id === after.tournament.id &&
		before.source === after.source &&
		before.draw &&
		after.draw &&
		before.draw.events.length <= after.draw.events.length &&
		before.draw.events.every((event, index) => JSON.stringify(event) === JSON.stringify(after.draw!.events[index]))
	);
}

export function maskedBroadcastPool(pool: PotPool, round: number, reveals: BroadcastReveal[]): PotPool {
	const hidden = new Set(reveals.filter((reveal) => reveal.round === round && reveal.record === pool.record).map((reveal) => reveal.winner));
	return { ...pool, slots: pool.slots.map((key) => (key && hidden.has(key) ? null : key)), drawOrder: pool.drawOrder.filter((key) => !hidden.has(key)) };
}

export function broadcastEventIsPublic(event: PotEvent): PotEvent {
	return { round: event.round, record: event.record, message: event.message, teamKey: event.teamKey, fromSlot: event.fromSlot, toSlot: event.toSlot };
}
