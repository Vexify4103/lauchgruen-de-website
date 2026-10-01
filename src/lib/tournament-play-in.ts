import { getDb } from "@/lib/mongo";
import { playInDefinitions, resolveBracket, type ResolvedBracketMatch } from "@/lib/bracket-engine";
import type { StoredTournamentMatch } from "@/lib/tournament-storage";

const COLLECTION = "tournament_play_in";

export type PlayInPair = { teamAKey: string; teamAName: string; teamBKey: string; teamBName: string };
export type PlayInState = { tournamentId: string; pairs: PlayInPair[]; createdAt: string; createdBy?: string };
type PlayInDoc = PlayInState & { _id: string };
type BotStateDoc = { _id: string; teams?: Record<string, { name: string }> };

export type ResolvedPlayIn = {
	pairs: PlayInPair[];
	matches: ResolvedBracketMatch<StoredTournamentMatch>[];
	/** Every play-in match has a winner. */
	complete: boolean;
	eliminated: string[];
	qualified: string[];
};

export async function getPlayInState(tournamentId: string): Promise<PlayInState | null> {
	const db = await getDb();
	const [doc, bot] = await Promise.all([
		db.collection<PlayInDoc>(COLLECTION).findOne({ _id: tournamentId }),
		db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" }, { projection: { teams: 1 } }),
	]);
	if (!doc) return null;
	// Names follow team renames; the keys stay stable.
	const nameOf = (key: string, fallback: string) => bot?.teams?.[key]?.name ?? fallback;
	return {
		tournamentId: doc.tournamentId,
		createdAt: doc.createdAt,
		createdBy: doc.createdBy,
		pairs: doc.pairs.map((pair) => ({ ...pair, teamAName: nameOf(pair.teamAKey, pair.teamAName), teamBName: nameOf(pair.teamBKey, pair.teamBName) })),
	};
}

/** Pairs the chosen teams in order: first against last, second against second-to-last, and so on. */
export function pairPlayInTeams<T extends { key: string; name: string }>(teams: T[]): PlayInPair[] {
	const pairs: PlayInPair[] = [];
	for (let index = 0; index < teams.length / 2; index += 1) {
		const teamA = teams[index];
		const teamB = teams[teams.length - 1 - index];
		pairs.push({ teamAKey: teamA.key, teamAName: teamA.name, teamBKey: teamB.key, teamBName: teamB.name });
	}
	return pairs;
}

export async function createPlayIn(input: { tournamentId: string; teams: Array<{ key: string; name: string }>; createdBy?: string }): Promise<PlayInState> {
	if (input.teams.length < 2 || input.teams.length % 2 !== 0) throw new Error("Das Play-in braucht eine gerade Anzahl von Teams.");
	if (new Set(input.teams.map((team) => team.key)).size !== input.teams.length) throw new Error("Ein Team wurde doppelt ausgewählt.");
	const db = await getDb();
	const state: PlayInState = { tournamentId: input.tournamentId, pairs: pairPlayInTeams(input.teams), createdAt: new Date().toISOString(), createdBy: input.createdBy };
	const result = await db.collection<PlayInDoc>(COLLECTION).updateOne({ _id: input.tournamentId }, { $setOnInsert: { _id: input.tournamentId, ...state } }, { upsert: true });
	if (result.upsertedCount !== 1) throw new Error("Das Play-in wurde bereits erstellt. Setze es zuerst zurück.");
	return state;
}

/** Removes the play-in. Refused once any play-in match has a result or started. */
export async function resetPlayIn(tournamentId: string): Promise<void> {
	const db = await getDb();
	const state = await db.collection<PlayInDoc>(COLLECTION).findOne({ _id: tournamentId });
	if (!state) return;
	const ids = state.pairs.map((_, index) => `pi-m${index + 1}`);
	const started = await db
		.collection<StoredTournamentMatch & { _id: string }>("tournament_matches")
		.countDocuments({ id: { $in: ids }, $or: [{ scoreA: { $exists: true } }, { status: { $in: ["Pending", "Live", "Finished"] } }] });
	if (started > 0) throw new Error("Das Play-in hat bereits begonnen und kann nicht mehr zurückgesetzt werden.");
	await Promise.all([db.collection<PlayInDoc>(COLLECTION).deleteOne({ _id: tournamentId }), db.collection("tournament_matches").deleteMany({ id: { $in: ids } })]);
}

export async function clearPlayIn(): Promise<void> {
	await (await getDb()).collection(COLLECTION).deleteMany({});
}

export function resolvePlayIn(state: PlayInState | null, stored: Record<string, StoredTournamentMatch>, bestOf: number): ResolvedPlayIn | null {
	if (!state) return null;
	const seeds = Object.fromEntries(state.pairs.flatMap((pair, index) => [[index * 2 + 1, pair.teamAName] as const, [index * 2 + 2, pair.teamBName] as const]));
	const matches = resolveBracket({ definitions: playInDefinitions(state.pairs.length), seeds, stored, bestOf: () => bestOf });
	return {
		pairs: state.pairs,
		matches,
		complete: matches.every((match) => match.winner),
		eliminated: matches.flatMap((match) => (match.loser ? [match.loser] : [])),
		qualified: matches.flatMap((match) => (match.winner ? [match.winner] : [])),
	};
}

/** Play-in state plus results, read without loading every tournament match. */
export async function getPlayInOutcome(tournamentId: string, bestOf: number): Promise<ResolvedPlayIn | null> {
	const state = await getPlayInState(tournamentId);
	if (!state) return null;
	const ids = state.pairs.map((_, index) => `pi-m${index + 1}`);
	const docs = await (
		await getDb()
	)
		.collection<StoredTournamentMatch & { _id: string }>("tournament_matches")
		.find({ id: { $in: ids } })
		.toArray();
	const stored = Object.fromEntries(docs.map(({ _id, ...doc }) => [String(_id), doc as StoredTournamentMatch]));
	return resolvePlayIn(state, stored, bestOf);
}
