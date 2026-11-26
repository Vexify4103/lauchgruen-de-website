/**
 * Who gifts their sub to whom after the challenge (plan §9).
 *
 * Every payer owes one sub. Places 1–3 share the pot by the split. Nobody gifts to their own team.
 * The own-team rule can make a quota impossible (e.g. two teams: place 1 can only receive from
 * place 2's members), so quotas are capped by what is reachable and the rest moves down the places.
 * Deterministic: the same input always gives the same assignment.
 */

export type PayoutPayer = { id: string; teamId: string };
export type PayoutPlace = { teamId: string; memberIds: string[] };
export type PayoutAssignment = { payerId: string; recipientId: string; place: 1 | 2 | 3 };

/** Splits `total` by percentages with the largest-remainder method. The result always sums to `total`. */
export function splitByPercent(total: number, percents: number[]): number[] {
	const sum = percents.reduce((a, b) => a + b, 0);
	if (total <= 0 || sum <= 0) return percents.map(() => 0);
	const raw = percents.map((percent) => (total * percent) / sum);
	const base = raw.map(Math.floor);
	let rest = total - base.reduce((a, b) => a + b, 0);
	const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
	for (const { index } of order) {
		if (rest === 0) break;
		base[index] += 1;
		rest -= 1;
	}
	return base;
}

/** Assigns payers to places with max-flow, respecting quotas and the own-team rule. */
function assignToPlaces(payers: PayoutPayer[], places: PayoutPlace[], quotas: number[]): Map<string, number> {
	const capacity = [...quotas];
	const placeOf = new Map<string, number>();
	const payersOf: string[][] = places.map(() => []);
	const allowed = (payer: PayoutPayer, place: number) => places[place].teamId !== payer.teamId;

	// Augmenting paths: a payer takes a free place, or moves another payer away to make room.
	const tryAssign = (payer: PayoutPayer, seen: Set<number>): boolean => {
		for (let place = 0; place < places.length; place += 1) {
			if (!allowed(payer, place) || seen.has(place)) continue;
			seen.add(place);
			if (payersOf[place].length < capacity[place]) {
				payersOf[place].push(payer.id);
				placeOf.set(payer.id, place);
				return true;
			}
			for (const otherId of payersOf[place]) {
				const other = payers.find((entry) => entry.id === otherId)!;
				if (tryAssign(other, seen)) {
					payersOf[place] = payersOf[place].filter((id) => id !== otherId);
					payersOf[place].push(payer.id);
					placeOf.set(payer.id, place);
					return true;
				}
			}
		}
		return false;
	};

	for (const payer of payers) tryAssign(payer, new Set());
	// Quotas that could not be filled: the remaining payers go to the best place they may pay.
	for (const payer of payers) {
		if (placeOf.has(payer.id)) continue;
		const place = places.findIndex((_, index) => allowed(payer, index));
		if (place >= 0) {
			payersOf[place].push(payer.id);
			placeOf.set(payer.id, place);
		}
	}
	return placeOf;
}

/**
 * @param payers everyone who owes a sub, with their team
 * @param places ranked teams that receive, best first (at most 3 used)
 * @param split percent per place, e.g. [50, 30, 20]
 * Payers whose own team is the only receiving team owe nothing (no valid recipient).
 */
export function assignPayouts(payers: PayoutPayer[], places: PayoutPlace[], split: number[]): PayoutAssignment[] {
	const ranked = places.slice(0, 3).filter((place) => place.memberIds.length > 0);
	if (ranked.length === 0 || payers.length === 0) return [];
	const sortedPayers = [...payers].sort((a, b) => a.id.localeCompare(b.id));
	// Unused shares (fewer than 3 places) go to the places that exist, in proportion.
	const quotas = splitByPercent(sortedPayers.length, split.slice(0, ranked.length));
	const placeOf = assignToPlaces(sortedPayers, ranked, quotas);

	const result: PayoutAssignment[] = [];
	ranked.forEach((place, placeIndex) => {
		const members = [...place.memberIds].sort();
		const incoming = sortedPayers.filter((payer) => placeOf.get(payer.id) === placeIndex);
		// Alternate between the two members, so their counts differ by at most one.
		incoming.forEach((payer, index) => {
			result.push({ payerId: payer.id, recipientId: members[index % members.length], place: (placeIndex + 1) as 1 | 2 | 3 });
		});
	});
	return result;
}
