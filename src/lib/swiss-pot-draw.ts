import { computeSwissRecords, placementSwissCandidates, type SwissRuleTeam } from "@/lib/tournament-swiss-rules";

export type PotPairing = { id: string; teamAKey: string; teamBKey: string; recordA: string; recordB: string; bye: false; winnerTeamKey?: string };
export type PotPool = {
	record: string;
	teamKeys: string[];
	slots: (string | null)[];
	drawOrder: string[];
	complete: boolean;
	automatic: boolean;
	rematchApproved?: boolean;
	blockedRematches: string[];
};
export type PotRound = { round: number; pools: PotPool[]; pairings: PotPairing[]; complete: boolean };
export type PotEvent = { round: number; record: string; message: string; teamKey?: string; fromSlot?: number; toSlot?: number };
export type SwissPotState = { teams: SwissRuleTeam[]; rounds: PotRound[]; events: PotEvent[]; seededOrder?: string[] };
export type SwissPotAction = { type: "draw" } | { type: "result"; pairingId: string; winnerTeamKey: string } | { type: "approve-rematch"; record: string } | { type: "reset" };

export const slotLetter = (index: number) => String.fromCharCode(65 + index);
const opponentKey = (a: string, b: string) => [a, b].sort().join(":");
const recordLabel = (record: { wins: number; losses: number }) => `${record.wins}-${record.losses}`;
const previousOpponents = (state: SwissPotState) => new Set(state.rounds.flatMap((round) => round.pairings.map((pair) => opponentKey(pair.teamAKey, pair.teamBKey))));
const teamName = (state: SwissPotState, key: string) => state.teams.find((team) => team.key === key)!.name;

export function createSwissPotState(): SwissPotState {
	return {
		teams: ["Ahorn", "Birke", "Eiche", "Fichte", "Kastanie", "Linde", "Tanne", "Weide"].map((name, index) => ({ key: `fake-${index + 1}`, name: `Team ${name}` })),
		rounds: [],
		events: [],
	};
}

/** Read-only board preview; known two-team pots are shown, but no team is drawn. */
export function previewSwissPotRound(current: SwissPotState) {
	const state = structuredClone(current);
	let round = state.rounds.at(-1);
	try {
		if (!round || round.complete) round = openRound(state);
	} catch {
		return null;
	}
	return round;
}

/** Read-only preview of the next actual pot, including the first draw of a new round. */
export function nextSwissPot(current: SwissPotState) {
	const round = previewSwissPotRound(current);
	if (!round) return null;
	const pool = round.pools.find((entry) => !entry.complete && !entry.automatic);
	if (!pool) return null;
	return { round: round.round, record: pool.record, slot: pool.slots.indexOf(null), remaining: pool.teamKeys.filter((key) => !pool.drawOrder.includes(key)) };
}

/** Checks only whether undrawn teams can fill the remaining slots; it does not pre-draw them. */
function canComplete(slots: (string | null)[], remaining: string[], opponents: Set<string>): boolean {
	const half = slots.length / 2;
	const empty = slots.findIndex((key, index) => index >= half && key === null);
	if (empty < 0) return remaining.length === 0;
	const first = slots[empty - half];
	if (!first) return false;
	return remaining.some((key) => {
		if (opponents.has(opponentKey(first, key))) return false;
		const next = [...slots];
		next[empty] = key;
		return canComplete(
			next,
			remaining.filter((other) => other !== key),
			opponents
		);
	});
}

function finishPool(round: PotRound, pool: PotPool) {
	const half = pool.slots.length / 2;
	pool.complete = true;
	for (let index = 0; index < half; index++)
		round.pairings.push({
			id: `pot-r${round.round}-${pool.record}-m${index + 1}`,
			teamAKey: pool.slots[index]!,
			teamBKey: pool.slots[index + half]!,
			recordA: pool.record,
			recordB: pool.record,
			bye: false,
		});
	round.complete = round.pools.every((entry) => entry.complete);
}

function openRound(state: SwissPotState): PotRound {
	const previous = state.rounds.at(-1);
	if (previous && (!previous.complete || previous.pairings.some((pair) => !pair.winnerTeamKey)))
		throw new Error("Zuerst alle Teams ziehen und alle Sieger der aktuellen Runde eintragen.");
	const number = state.rounds.length + 1;
	if (number > 4) throw new Error("Die vier Testrunden sind abgeschlossen.");
	const records = computeSwissRecords(state.teams, state.rounds);
	const eligible = placementSwissCandidates(state.teams, previous?.pairings ?? [], number);
	if (number === 4 && eligible.length !== 4) throw new Error("Die Platzierungsrunde benötigt genau die vier Teams aus dem 1-1-Pool der dritten Runde.");
	const grouped = new Map<string, string[]>();
	for (const team of eligible) {
		const record = recordLabel(records.get(team.key)!);
		grouped.set(record, [...(grouped.get(record) ?? []), team.key]);
	}
	const round: PotRound = {
		round: number,
		pairings: [],
		complete: false,
		pools: [...grouped]
			.sort(([a], [b]) => Number(b.split("-")[0]) - Number(a.split("-")[0]))
			.map(([record, keys]) => ({ record, teamKeys: keys, slots: keys.map(() => null), drawOrder: [], complete: false, automatic: keys.length === 2, blockedRematches: [] })),
	};
	const opponents = previousOpponents(state);
	for (const pool of round.pools) {
		if (number === 1 && state.seededOrder?.length) {
			if (state.seededOrder.length !== 8 || new Set(state.seededOrder).size !== 8 || state.seededOrder.some((key) => !pool.teamKeys.includes(key)))
				throw new Error("Die Setzliste muss genau die acht teilnehmenden Teams enthalten.");
			pool.slots = [...state.seededOrder];
			pool.automatic = true;
			finishPool(round, pool);
			state.events.push({ round: number, record: pool.record, message: "Erste Runde nach veröffentlichter Setzliste: obere gegen untere Hälfte. Keine zufällige Ziehung." });
			continue;
		}
		if (![2, 4, 8].includes(pool.teamKeys.length)) throw new Error("Dieser Simulator unterstützt nur die Bilanzgruppen der Acht-Team-Platzierungs-Swiss.");
		if (!pool.automatic) continue;
		pool.slots = [...pool.teamKeys];
		const [a, b] = pool.teamKeys;
		if (opponents.has(opponentKey(a, b))) {
			pool.blockedRematches = [opponentKey(a, b)];
			state.events.push({
				round: number,
				record: pool.record,
				message: `${teamName(state, a)} gegen ${teamName(state, b)} wäre ein Rematch. Keine andere Paarung mit gleicher Bilanz möglich; die Runde wartet auf eine Entscheidung.`,
			});
		} else {
			finishPool(round, pool);
			state.events.push({
				round: number,
				record: pool.record,
				message: `Automatisch: ${teamName(state, a)} gegen ${teamName(state, b)}. Zwei Teams im Topf, keine Ziehung nötig.`,
			});
		}
	}
	state.rounds.push(round);
	return round;
}

/** Non-automatic pots draw one new team into a free slot, without moving earlier draws. */
export function advanceSwissPotDraw(current: SwissPotState, action: SwissPotAction, randomIndex: (length: number) => number): SwissPotState {
	if (action.type === "reset") return createSwissPotState();
	const state = structuredClone(current);
	let round = state.rounds.at(-1);
	if (action.type === "result") {
		if (!round?.complete) throw new Error("Zuerst die Ziehung der ganzen Runde abschließen.");
		const pair = round.pairings.find((entry) => entry.id === action.pairingId);
		if (!pair || ![pair.teamAKey, pair.teamBKey].includes(action.winnerTeamKey)) throw new Error("Dieser Sieger gehört nicht zum aktuellen Testmatch.");
		pair.winnerTeamKey = action.winnerTeamKey;
		return state;
	}
	if (action.type === "approve-rematch") {
		const pool = round?.pools.find((entry) => entry.record === action.record);
		if (!round || round.round !== 4 || !pool?.blockedRematches.length || pool.complete) throw new Error("Keine offene Rematch-Entscheidung für diese Bilanzgruppe.");
		pool.rematchApproved = true;
		finishPool(round, pool);
		state.events.push({
			round: round.round,
			record: pool.record,
			message: `Rematch für den ${pool.record}-Platzierungstopf ausdrücklich freigegeben. Keine bilanzübergreifende Paarung.`,
		});
		return state;
	}
	if (!round || round.complete) round = openRound(state);
	const pool = round.pools.find((entry) => !entry.complete && !entry.automatic);
	if (!pool) return state;
	const remaining = pool.teamKeys.filter((key) => !pool.drawOrder.includes(key));
	const index = randomIndex(remaining.length);
	if (!Number.isInteger(index) || index < 0 || index >= remaining.length) throw new Error("Ungültiger Zufallsindex.");
	const drawn = remaining[index];
	const firstEmpty = pool.slots.indexOf(null);
	const half = pool.slots.length / 2;
	const opponents = previousOpponents(state);
	let target = firstEmpty;
	if (firstEmpty >= half) {
		target = pool.slots.findIndex((key, slot) => {
			if (slot < half || key !== null || opponents.has(opponentKey(pool.slots[slot - half]!, drawn))) return false;
			const candidate = [...pool.slots];
			candidate[slot] = drawn;
			return canComplete(
				candidate,
				remaining.filter((other) => other !== drawn),
				opponents
			);
		});
		if (target < 0) throw new Error("Kein gültiger Slot ohne Rematch. Es wurde kein Team erneut gezogen oder gespeichert.");
	}
	pool.slots[target] = drawn;
	pool.drawOrder.push(drawn);
	if (
		pool.drawOrder.length === half &&
		!canComplete(
			pool.slots,
			remaining.filter((key) => key !== drawn),
			opponents
		)
	)
		throw new Error("Diese linke Hälfte lässt keine rematchfreie Zuordnung zu. Ziehung abgebrochen.");
	state.events.push({
		round: round.round,
		record: pool.record,
		teamKey: drawn,
		fromSlot: firstEmpty,
		toSlot: target,
		message:
			target === firstEmpty
				? `${teamName(state, drawn)} gezogen: Slot ${slotLetter(target)}.`
				: `${teamName(state, drawn)} gezogen: Slot ${slotLetter(firstEmpty)} wäre ungültig oder würde die restlichen Slots blockieren. Verschoben auf Slot ${slotLetter(target)}; Slot ${slotLetter(firstEmpty)} bleibt für das nächste Team frei.`,
	});
	if (pool.drawOrder.length === pool.teamKeys.length) {
		for (let slot = 0; slot < half; slot++)
			if (opponents.has(opponentKey(pool.slots[slot]!, pool.slots[slot + half]!))) throw new Error("Rematch verhindert; die Ziehung wurde nicht gespeichert.");
		finishPool(round, pool);
	}
	return state;
}

export function swissPotSeeds(state: SwissPotState): { seed: number; teamKey: string }[] {
	if (state.rounds.length !== 4 || state.rounds.some((round) => !round.complete || round.pairings.some((pair) => !pair.winnerTeamKey))) return [];
	const ranks = [
		[state.rounds[2], "2-0", 1],
		[state.rounds[3], "2-1", 3],
		[state.rounds[3], "1-2", 5],
		[state.rounds[2], "0-2", 7],
	] as const;
	return ranks.flatMap(([round, record, seed]) => {
		const pair = round.pairings.find((entry) => entry.recordA === record)!;
		return [
			{ seed, teamKey: pair.winnerTeamKey! },
			{ seed: seed + 1, teamKey: pair.winnerTeamKey === pair.teamAKey ? pair.teamBKey : pair.teamAKey },
		];
	});
}
