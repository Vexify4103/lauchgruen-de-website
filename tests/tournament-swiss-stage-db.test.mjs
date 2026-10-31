// Drives the real Swiss draw (drawNextSwissMatchup) against a throwaway local Mongo database.
// Runs only when SWISS_DB_TEST_URI points at a local server, so the normal suite never touches a real DB.
import assert from "node:assert/strict";
import test from "node:test";

const uri = process.env.SWISS_DB_TEST_URI;
const isLocal = Boolean(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri));

if (isLocal) {
	process.env.MONGODB_URI = uri;
	process.env.MONGODB_DB = `lauchgruen_swiss_test_${process.pid}`;
}

const TEAM_KEYS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
const TEAMS = TEAM_KEYS.map((key) => ({ key, name: key }));

function recordOf(rounds, key) {
	let wins = 0;
	let losses = 0;
	for (const round of rounds)
		for (const pairing of round.pairings) {
			if (pairing.bye && pairing.teamAKey === key) wins += 1;
			if (pairing.bye || !pairing.winnerTeamKey) continue;
			if (pairing.teamAKey !== key && pairing.teamBKey !== key) continue;
			if (pairing.winnerTeamKey === key) wins += 1;
			else losses += 1;
		}
	return `${wins}-${losses}`;
}

async function drawFullRound(swiss, options) {
	let result;
	do result = await swiss.drawNextSwissMatchup(options);
	while (!result.round.complete);
	return result.state.rounds.at(-1);
}

async function playRound(swiss, tournamentId, round) {
	for (const pairing of round.pairings) {
		if (pairing.bye) continue;
		const winner = Math.random() < 0.5 ? pairing.teamAKey : pairing.teamBKey;
		await swiss.setSwissPairingWinner(tournamentId, pairing.id, winner);
	}
}

test("live Swiss draws never pair teams with different records", { skip: !isLocal && "set SWISS_DB_TEST_URI to a local Mongo" }, async (t) => {
	const swiss = await import("../src/lib/tournament-swiss.ts");
	const { getDb } = await import("../src/lib/mongo.ts");
	const db = await getDb();
	t.after(async () => {
		await db.dropDatabase();
		const client = await globalThis.__lauchgruenMongoClient;
		await client?.close();
	});

	const formats = [
		{ label: "placement Swiss 8 teams, 4 rounds", maximumRounds: 4, placementSwiss: true },
		{ label: "Swiss 8 teams, 5 rounds", maximumRounds: 5 },
		{ label: "Swiss with elimination at 3", maximumRounds: 5, eliminationThreshold: 3 },
		{ label: "Swiss 7 teams with byes", maximumRounds: 4, teams: TEAMS.slice(0, 7) },
	];
	const stats = { rounds: 0, refusedCrossRecord: 0, approvedRematches: 0, byFormat: {} };
	for (const format of formats) {
		for (let run = 0; run < 15; run += 1) {
			const tournamentId = `swiss-db-${format.maximumRounds}-${run}-${Math.random().toString(36).slice(2)}`;
			const options = {
				tournamentId,
				maximumRounds: format.maximumRounds,
				teams: format.teams ?? TEAMS,
				matchPrefix: tournamentId,
				persistMatches: false,
				pairByRecord: true,
				placementSwiss: format.placementSwiss === true,
				requireCompletedRound: true,
				eliminationThreshold: format.eliminationThreshold,
			};
			for (let roundNumber = 1; roundNumber <= format.maximumRounds; roundNumber += 1) {
				let round;
				try {
					round = await drawFullRound(swiss, options);
				} catch (error) {
					// Elimination Swiss may finish early; a refused draw is fine, a silent cross-record round is not.
					if (/abgeschlossen/.test(error.message)) break;
					if (error.code === "rematch-required") {
						// Placement round 4: both pools already met. With approval the round stays inside the records.
						assert.ok(format.placementSwiss && roundNumber === 4, `${format.label}: rematch request outside placement round 4`);
						assert.ok(error.rematchPairs.length > 0);
						stats.approvedRematches += 1;
						round = await drawFullRound(swiss, { ...options, allowPlacementRematch: true });
					} else if (error.code === "cross-record-required" || /Platzierungs-Swiss/.test(error.message)) {
						assert.ok(!format.placementSwiss, `${format.label}: placement Swiss got stuck: ${error.message}`);
						stats.refusedCrossRecord += 1;
						stats.byFormat[format.label] = (stats.byFormat[format.label] ?? 0) + 1;
						break;
					} else throw error;
				}
				stats.rounds += 1;
				const before = (await swiss.getSwissStageState(tournamentId)).rounds.slice(0, -1);
				for (const pairing of round.pairings) {
					if (pairing.bye) continue;
					const recordA = recordOf(before, pairing.teamAKey);
					const recordB = recordOf(before, pairing.teamBKey);
					assert.equal(recordA, recordB, `${format.label} round ${round.round}: ${pairing.teamAKey} (${recordA}) vs ${pairing.teamBKey} (${recordB})`);
					assert.equal(pairing.recordA, recordA);
					assert.equal(pairing.recordB, recordB);
				}

				// Only part of the results in: the next draw must refuse instead of pairing from stale records.
				const open = round.pairings.filter((pairing) => !pairing.bye);
				if (open.length > 1 && roundNumber < format.maximumRounds) {
					await swiss.setSwissPairingWinner(tournamentId, open[0].id, open[0].teamAKey);
					await assert.rejects(() => swiss.drawNextSwissMatchup(options), /Trage zuerst für alle Matches/);
				}
				await playRound(swiss, tournamentId, round);
			}
		}
	}
	t.diagnostic(`${stats.rounds} rounds drawn, ${stats.refusedCrossRecord} draws refused for staff approval ${JSON.stringify(stats.byFormat)}, ${stats.approvedRematches} placement rematches approved`);
	assert.ok(stats.rounds > 100);
});
