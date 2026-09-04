import { randomInt } from "node:crypto";
import { getDb } from "@/lib/mongo";
import { computeSwissRecords, findExactSwissRecordMatching, placementSwissCandidates, type SwissRuleRecord } from "@/lib/tournament-swiss-rules";

const COLLECTION = "tournament_swiss_stages";
const AUDIT_COLLECTION = "tournament_swiss_audit";

export type SwissPairing = {
	id: string;
	round: number;
	slot: number;
	teamAKey: string;
	teamAName: string;
	teamBKey: string | null;
	teamBName: string | null;
	bye: boolean;
	recordA?: string;
	recordB?: string;
	winnerTeamKey?: string;
};

export type SwissRound = { round: number; pairings: SwissPairing[]; complete: boolean; drawnAt: string; drawnBy?: string };
export type SwissStageState = { tournamentId: string; rounds: SwissRound[]; updatedAt: string; nextBracket?: string };
type SwissRoundDoc = SwissRound & { pendingPairings?: SwissPairing[] };
type SwissStageDoc = Omit<SwissStageState, "rounds"> & { _id: string; rounds: SwissRoundDoc[] };
export type SwissTeam = { key: string; name: string };
type BotStateDoc = { _id: string; teams?: Record<string, { name: string }> };
type SwissMatchDoc = { _id: string; id: string; status: string; scoreA?: number; scoreB?: number };

export type SwissAuditEntry = {
	id: string;
	tournamentId: string;
	action: "round-created" | "pairing-revealed" | "result-set" | "round-repaired" | "round-reset" | "reset";
	createdAt: string;
	actor?: string;
	round?: number;
	pairingId?: string;
	detail: string;
	metadata?: Record<string, unknown>;
};

type SwissAuditDoc = Omit<SwissAuditEntry, "id"> & { _id: string };

async function writeSwissAudit(entry: Omit<SwissAuditEntry, "id" | "createdAt">) {
	const document: SwissAuditDoc = { _id: crypto.randomUUID(), ...entry, createdAt: new Date().toISOString() };
	await (await getDb()).collection<SwissAuditDoc>(AUDIT_COLLECTION).insertOne(document);
}

export async function listSwissAudit(tournamentId: string, limit = 30): Promise<SwissAuditEntry[]> {
	const documents = await (await getDb())
		.collection<SwissAuditDoc>(AUDIT_COLLECTION)
		.find({ tournamentId })
		.sort({ createdAt: -1 })
		.limit(Math.max(1, Math.min(limit, 100)))
		.toArray();
	return documents.map(({ _id, ...entry }) => ({ id: _id, ...entry }));
}

function shuffle<T>(values: T[]) {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const swap = randomInt(index + 1);
		[result[index], result[swap]] = [result[swap], result[index]];
	}
	return result;
}

function opponentKey(first: string, second: string) {
	return [first, second].sort().join(":");
}

function findRandomMatching(teams: SwissTeam[], previousOpponents: Set<string>): Array<[SwissTeam, SwissTeam]> | null {
	function solve(remaining: SwissTeam[]): Array<[SwissTeam, SwissTeam]> | null {
		if (remaining.length === 0) return [];
		const [first, ...rest] = remaining;
		for (const opponent of shuffle(rest)) {
			if (previousOpponents.has(opponentKey(first.key, opponent.key))) continue;
			const tail = solve(rest.filter((team) => team.key !== opponent.key));
			if (tail) return [[first, opponent], ...tail];
		}
		return null;
	}
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const result = solve(shuffle(teams));
		if (result) return result;
	}
	return null;
}

type SwissRecord = SwissRuleRecord;

function recordLabel(record: SwissRecord) {
	return `${record.wins}-${record.losses}`;
}

function findRecordMatching(teams: SwissTeam[], records: Map<string, SwissRecord>, previousOpponents: Set<string>): Array<[SwissTeam, SwissTeam]> | null {
	function distance(first: SwissTeam, second: SwissTeam) {
		const a = records.get(first.key)!;
		const b = records.get(second.key)!;
		return Math.abs(a.wins - b.wins) + Math.abs(a.losses - b.losses);
	}
	function solve(remaining: SwissTeam[]): Array<[SwissTeam, SwissTeam]> | null {
		if (!remaining.length) return [];
		const [first, ...rest] = remaining;
		const candidates = shuffle(rest).sort((a, b) => distance(first, a) - distance(first, b));
		for (const opponent of candidates) {
			if (previousOpponents.has(opponentKey(first.key, opponent.key))) continue;
			const tail = solve(rest.filter((team) => team.key !== opponent.key));
			if (tail) return [[first, opponent], ...tail];
		}
		return null;
	}
	return solve(
		shuffle(teams).sort((a, b) => {
			const first = records.get(a.key)!;
			const second = records.get(b.key)!;
			return second.wins - first.wins || first.losses - second.losses;
		})
	);
}

export async function listSwissTeams(): Promise<SwissTeam[]> {
	const db = await getDb();
	const doc = await db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" });
	return Object.entries(doc?.teams ?? {})
		.map(([key, team]) => ({ key, name: team.name }))
		.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function getSwissStageState(tournamentId: string): Promise<SwissStageState> {
	const db = await getDb();
	const doc = await db.collection<SwissStageDoc>(COLLECTION).findOne({ _id: tournamentId });
	return doc
		? {
				tournamentId: doc.tournamentId,
				rounds: (doc.rounds ?? []).map((round) => ({
					round: round.round,
					pairings: round.pairings,
					complete: round.complete ?? true,
					drawnAt: round.drawnAt,
					drawnBy: round.drawnBy,
				})),
				updatedAt: doc.updatedAt,
				nextBracket: doc.rounds.at(-1)?.pendingPairings?.[0]
					? doc.rounds.at(-1)!.pendingPairings![0].recordA === doc.rounds.at(-1)!.pendingPairings![0].recordB
						? doc.rounds.at(-1)!.pendingPairings![0].recordA
						: `${doc.rounds.at(-1)!.pendingPairings![0].recordA} / ${doc.rounds.at(-1)!.pendingPairings![0].recordB}`
					: undefined,
			}
		: { tournamentId, rounds: [], updatedAt: new Date(0).toISOString() };
}

async function getSwissStageDocument(tournamentId: string) {
	const db = await getDb();
	return db.collection<SwissStageDoc>(COLLECTION).findOne({ _id: tournamentId });
}

export async function drawNextSwissMatchup(input: {
	tournamentId: string;
	maximumRounds: number;
	drawnBy?: string;
	teams?: SwissTeam[];
	matchPrefix?: string;
	persistMatches?: boolean;
	pairByRecord?: boolean;
	placementSwiss?: boolean;
	requireCompletedRound?: boolean;
	syncMatchResults?: boolean;
}) {
	const [document, teams] = await Promise.all([getSwissStageDocument(input.tournamentId), input.teams ? Promise.resolve(input.teams) : listSwissTeams()]);
	const matchPrefix = input.matchPrefix ?? "swiss";
	const rounds = [...(document?.rounds ?? [])];
	if (
		input.pairByRecord &&
		rounds.some((round) =>
			round.pairings.some(
				(pairing) => !teams.some((team) => team.key === pairing.teamAKey) || Boolean(pairing.teamBKey && !teams.some((team) => team.key === pairing.teamBKey))
			)
		)
	) {
		throw new Error("Die Teamanzahl wurde seit dem Teststart geändert. Setze die Swiss-Simulation bitte zurück.");
	}
	if (teams.length < 2) throw new Error("Für eine Swiss-Auslosung werden mindestens zwei Teams benötigt.");
	const activeRound = rounds.at(-1);
	if (activeRound && !activeRound.complete && activeRound.pendingPairings?.length) {
		const [pairing, ...pendingPairings] = activeRound.pendingPairings;
		const now = new Date().toISOString();
		activeRound.pairings = [...activeRound.pairings, pairing];
		activeRound.pendingPairings = pendingPairings;
		activeRound.complete = pendingPairings.length === 0;
		const db = await getDb();
		await db.collection<SwissStageDoc>(COLLECTION).updateOne({ _id: input.tournamentId }, { $set: { rounds, updatedAt: now } });
		if (input.persistMatches !== false && !pairing.bye)
			await db.collection<SwissMatchDoc>("tournament_matches").updateOne({ _id: pairing.id }, { $setOnInsert: { id: pairing.id, status: "Scheduled" } }, { upsert: true });
		await writeSwissAudit({
			tournamentId: input.tournamentId,
			action: "pairing-revealed",
			actor: input.drawnBy,
			round: activeRound.round,
			pairingId: pairing.id,
			detail: pairing.bye ? `${pairing.teamAName} erhält ein Freilos.` : `${pairing.teamAName} gegen ${pairing.teamBName} aufgedeckt.`,
			metadata: { recordA: pairing.recordA, recordB: pairing.recordB, remainingReveals: pendingPairings.length },
		});
		return { state: await getSwissStageState(input.tournamentId), round: { ...activeRound, pendingPairings: undefined }, pairing };
	}

	if (input.syncMatchResults) {
		const db = await getDb();
		const matchIds = rounds.flatMap((round) => round.pairings.filter((pairing) => !pairing.bye).map((pairing) => pairing.id));
		const matches = matchIds.length
			? await db
					.collection<SwissMatchDoc>("tournament_matches")
					.find({ id: { $in: matchIds } })
					.toArray()
			: [];
		const byId = new Map(matches.map((match) => [match.id, match]));
		let changed = false;
		for (const round of rounds)
			for (const pairing of round.pairings) {
				if (pairing.bye || pairing.winnerTeamKey) continue;
				const match = byId.get(pairing.id);
				if (match?.scoreA === undefined || match.scoreB === undefined || match.scoreA === match.scoreB) continue;
				pairing.winnerTeamKey = match.scoreA > match.scoreB ? pairing.teamAKey : (pairing.teamBKey ?? undefined);
				changed = true;
			}
		if (changed) await db.collection<SwissStageDoc>(COLLECTION).updateOne({ _id: input.tournamentId }, { $set: { rounds, updatedAt: new Date().toISOString() } });
	}
	const state: SwissStageState = {
		tournamentId: input.tournamentId,
		rounds: rounds.map((round) => ({ round: round.round, pairings: round.pairings, complete: round.complete, drawnAt: round.drawnAt, drawnBy: round.drawnBy })),
		updatedAt: document?.updatedAt ?? new Date(0).toISOString(),
	};
	if (input.requireCompletedRound && rounds.some((round) => round.complete && round.pairings.some((pairing) => !pairing.bye && !pairing.winnerTeamKey))) {
		throw new Error("Trage zuerst für alle Matches der aktuellen Runde einen Sieger ein.");
	}
	const nextRound = rounds.length + 1;
	if (nextRound > input.maximumRounds) throw new Error("Alle konfigurierten Swiss-Runden wurden bereits ausgelost.");
	const maximumUniqueRounds = teams.length % 2 === 0 ? teams.length - 1 : teams.length;
	if (nextRound > maximumUniqueRounds) throw new Error(`Mit ${teams.length} Teams sind ohne Rematches höchstens ${maximumUniqueRounds} Runden möglich.`);

	const previousOpponents = new Set(
		state.rounds.flatMap((round) => round.pairings.flatMap((pairing) => (pairing.teamBKey ? [opponentKey(pairing.teamAKey, pairing.teamBKey)] : [])))
	);
	const records = computeSwissRecords(teams, rounds);
	const placementSwiss = input.placementSwiss === true && teams.length === 8 && input.maximumRounds === 4;
	const previousPairings = rounds.find((round) => round.round === nextRound - 1)?.pairings ?? [];
	let candidates = placementSwiss ? placementSwissCandidates(teams, previousPairings, nextRound) : teams;
	if (placementSwiss && nextRound === 4 && candidates.length !== 4) {
		throw new Error("Runde 4 benötigt genau die vier Teams aus den Bilanzgruppen 2-1 und 1-2.");
	}
	const byeCounts = new Map(teams.map((team) => [team.key, 0]));
	for (const round of state.rounds) for (const pairing of round.pairings) if (pairing.bye) byeCounts.set(pairing.teamAKey, (byeCounts.get(pairing.teamAKey) ?? 0) + 1);
	let byeTeam: SwissTeam | null = null;
	if (candidates.length % 2 !== 0) {
		const minimumByes = Math.min(...candidates.map((team) => byeCounts.get(team.key) ?? 0));
		byeTeam = shuffle(candidates.filter((team) => (byeCounts.get(team.key) ?? 0) === minimumByes))[0];
		candidates = candidates.filter((team) => team.key !== byeTeam?.key);
	}
	const pairingContext = candidates.map((team) => ({
		teamKey: team.key,
		teamName: team.name,
		record: recordLabel(records.get(team.key)!),
		previousOpponents: teams.filter((opponent) => previousOpponents.has(opponentKey(team.key, opponent.key))).map((opponent) => opponent.key),
	}));
	const exactMatching = input.pairByRecord ? findExactSwissRecordMatching(shuffle(candidates), records, previousOpponents) : null;
	const matching = exactMatching ?? (placementSwiss ? null : input.pairByRecord ? findRecordMatching(candidates, records, previousOpponents) : findRandomMatching(candidates, previousOpponents));
	if (!matching) {
		throw new Error(
			placementSwiss
				? "Die Platzierungs-Swiss kann diese Bilanzgruppe nicht ohne Rematch paaren. Es wurde keine bilanzübergreifende Paarung erzeugt."
				: "Für diese Runde existiert keine gültige zufällige Paarung mehr, ohne ein früheres Match zu wiederholen."
		);
	}
	const pairings: SwissPairing[] = matching.map(([teamA, teamB], index) => ({
		id: `${matchPrefix}-r${nextRound}-m${index + 1}`,
		round: nextRound,
		slot: index + 1,
		teamAKey: teamA.key,
		teamAName: teamA.name,
		teamBKey: teamB.key,
		teamBName: teamB.name,
		bye: false,
		recordA: recordLabel(records.get(teamA.key)!),
		recordB: recordLabel(records.get(teamB.key)!),
	}));
	if (byeTeam)
		pairings.push({
			id: `${matchPrefix}-r${nextRound}-bye`,
			round: nextRound,
			slot: pairings.length + 1,
			teamAKey: byeTeam.key,
			teamAName: byeTeam.name,
			teamBKey: null,
			teamBName: null,
			bye: true,
			recordA: recordLabel(records.get(byeTeam.key)!),
			winnerTeamKey: byeTeam.key,
		});
	const revealOrder = input.pairByRecord ? pairings.sort((a, b) => (b.recordA ?? "").localeCompare(a.recordA ?? "") || randomInt(3) - 1) : shuffle(pairings);
	const [pairing, ...pendingPairings] = revealOrder;
	const round: SwissRoundDoc = {
		round: nextRound,
		pairings: [pairing],
		pendingPairings,
		complete: pendingPairings.length === 0,
		drawnAt: new Date().toISOString(),
		drawnBy: input.drawnBy,
	};
	const db = await getDb();
	await db
		.collection<SwissStageDoc>(COLLECTION)
		.updateOne(
			{ _id: input.tournamentId, [`rounds.${nextRound - 1}`]: { $exists: false } },
			{ $setOnInsert: { tournamentId: input.tournamentId }, $push: { rounds: round }, $set: { updatedAt: round.drawnAt } },
			{ upsert: true }
		);
	if (input.persistMatches !== false && !pairing.bye)
		await db.collection<SwissMatchDoc>("tournament_matches").updateOne({ _id: pairing.id }, { $setOnInsert: { id: pairing.id, status: "Scheduled" } }, { upsert: true });
	await writeSwissAudit({
		tournamentId: input.tournamentId,
		action: "round-created",
		actor: input.drawnBy,
		round: nextRound,
		pairingId: pairing.id,
		detail: input.pairByRecord
			? `Runde ${nextRound} wurde nach gleicher beziehungsweise nächster Bilanz ohne Rematches gepaart.`
			: `Runde ${nextRound} wurde zufällig und ohne Rematches gepaart.`,
		metadata: {
			pairByRecord: Boolean(input.pairByRecord),
			teamPool: pairingContext,
			selectedPairings: pairings.map((entry) => ({ id: entry.id, teamAKey: entry.teamAKey, teamBKey: entry.teamBKey, recordA: entry.recordA, recordB: entry.recordB })),
			revealOrder: revealOrder.map((entry) => entry.id),
		},
	});
	return { state: await getSwissStageState(input.tournamentId), round: { ...round, pendingPairings: undefined }, pairing };
}

export async function setSwissPairingWinner(tournamentId: string, pairingId: string, winnerTeamKey: string) {
	const db = await getDb();
	const document = await db.collection<SwissStageDoc>(COLLECTION).findOne({ _id: tournamentId });
	const roundIndex = document?.rounds.findIndex((round) => round.pairings.some((entry) => entry.id === pairingId)) ?? -1;
	const pairing = roundIndex >= 0 ? document?.rounds[roundIndex].pairings.find((entry) => entry.id === pairingId) : undefined;
	if (!pairing || pairing.bye || !pairing.teamBKey) throw new Error("Diese Swiss-Paarung wurde nicht gefunden.");
	if (document && roundIndex < document.rounds.length - 1) throw new Error("Das Ergebnis kann nicht mehr geändert werden, weil die nächste Runde bereits ausgelost wurde.");
	if (winnerTeamKey !== pairing.teamAKey && winnerTeamKey !== pairing.teamBKey) throw new Error("Der gewählte Sieger gehört nicht zu diesem Match.");
	await db
		.collection<SwissStageDoc>(COLLECTION)
		.updateOne(
			{ _id: tournamentId, "rounds.pairings.id": pairingId },
			{ $set: { "rounds.$[].pairings.$[pairing].winnerTeamKey": winnerTeamKey, updatedAt: new Date().toISOString() } },
			{ arrayFilters: [{ "pairing.id": pairingId }] }
		);
	await writeSwissAudit({
		tournamentId,
		action: "result-set",
		round: pairing.round,
		pairingId,
		detail: `${winnerTeamKey} als Sieger für ${pairingId} gespeichert.`,
		metadata: { winnerTeamKey, teamAKey: pairing.teamAKey, teamBKey: pairing.teamBKey },
	});
	return getSwissStageState(tournamentId);
}

export async function resetSwissStage(tournamentId: string, matchPrefix = "swiss") {
	const db = await getDb();
	const escapedPrefix = matchPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	await Promise.all([
		db.collection<SwissStageDoc>(COLLECTION).deleteOne({ _id: tournamentId }),
		db.collection<SwissMatchDoc>("tournament_matches").deleteMany({ id: new RegExp(`^${escapedPrefix}-r\\d+-(?:m\\d+|bye)$`) }),
	]);
	await writeSwissAudit({ tournamentId, action: "reset", detail: `Swiss Stage und Matches mit Präfix ${matchPrefix} zurückgesetzt.` });
}

export async function resetLatestSwissRound(tournamentId: string) {
	const db = await getDb();
	const document = await db.collection<SwissStageDoc>(COLLECTION).findOne({ _id: tournamentId });
	const latestRound = document?.rounds.at(-1);
	if (!latestRound) throw new Error("Es gibt keine Swiss-Runde, die neu ausgelost werden kann.");

	const pairings = [...latestRound.pairings, ...(latestRound.pendingPairings ?? [])];
	const matchIds = pairings.filter((pairing) => !pairing.bye).map((pairing) => pairing.id);
	if (pairings.some((pairing) => Boolean(pairing.winnerTeamKey) && !pairing.bye)) {
		throw new Error("Die aktuelle Runde hat bereits Ergebnisse und kann nicht mehr neu ausgelost werden.");
	}

	const [matches, draftCount, rollCount, checkInCount, reportCount] = await Promise.all([
		matchIds.length ? db.collection<SwissMatchDoc>("tournament_matches").find({ id: { $in: matchIds } }).toArray() : [],
		matchIds.length ? db.collection<{ _id: string }>("tournament_drafts").countDocuments({ _id: { $in: matchIds } }) : 0,
		matchIds.length ? db.collection("ultimate_bravery_rolls").countDocuments({ matchId: { $in: matchIds } }) : 0,
		matchIds.length ? db.collection("tournament_captain_checkins").countDocuments({ matchId: { $in: matchIds } }) : 0,
		matchIds.length ? db.collection("tournament_match_reports").countDocuments({ matchId: { $in: matchIds } }) : 0,
	]);
	const startedMatch = matches.some(
		(match) =>
			match.scoreA !== undefined ||
			match.scoreB !== undefined ||
			Boolean((match as SwissMatchDoc & { winner?: string }).winner) ||
			(Boolean(match.status) && match.status !== "Scheduled" && match.status !== "Locked")
	);
	if (startedMatch || draftCount > 0 || rollCount > 0 || checkInCount > 0 || reportCount > 0) {
		throw new Error("Die aktuelle Runde wurde bereits vorbereitet oder gestartet und kann deshalb nicht sicher neu ausgelost werden.");
	}

	const now = new Date().toISOString();
	const roundIndex = document!.rounds.length - 1;
	const update = await db
		.collection<SwissStageDoc>(COLLECTION)
		.updateOne({ _id: tournamentId, [`rounds.${roundIndex}.round`]: latestRound.round }, { $pop: { rounds: 1 }, $set: { updatedAt: now } });
	if (update.modifiedCount !== 1) throw new Error("Die Swiss-Runde wurde zwischenzeitlich verändert. Bitte lade die Seite neu.");
	if (matchIds.length) await db.collection<SwissMatchDoc>("tournament_matches").deleteMany({ id: { $in: matchIds } });
	await writeSwissAudit({
		tournamentId,
		action: "round-reset",
		round: latestRound.round,
		detail: `Swiss-Runde ${latestRound.round} wurde zur erneuten Auslosung entfernt. Frühere Runden bleiben erhalten.`,
		metadata: { matchIds },
	});
	return getSwissStageState(tournamentId);
}
