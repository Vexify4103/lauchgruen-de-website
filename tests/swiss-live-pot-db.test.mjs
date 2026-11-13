import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { swissStageToPotState } from "../src/lib/swiss-live-pot.ts";
import { swissPotSeeds } from "../src/lib/swiss-pot-draw.ts";
import { computeUltimateBraverySwissSeeds, resolveUltimateBraveryPlayoffMatches } from "../src/lib/ultimate-bravery-playoffs.ts";

const uri = process.env.SWISS_DB_TEST_URI;
const local = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?:\?[^#]*)?$/.test(uri));
const teams = Array.from({ length: 8 }, (_, index) => ({ key: `team-${index}`, name: `Testteam ${index}` }));
const epoch = new Date(0).toISOString();

test(
	"live team draw persists safe slots, real match IDs and a complete placement Swiss in isolated Mongo",
	{ skip: !local && "set SWISS_DB_TEST_URI to loopback Mongo" },
	async (t) => {
		process.env.MONGODB_URI = uri;
		const database = `lauchgruen_swiss_live_test_${randomUUID().replaceAll("-", "")}`;
		process.env.MONGODB_DB = database;
		const swiss = await import("../src/lib/tournament-swiss.ts");
		const { getDb } = await import("../src/lib/mongo.ts");
		const db = await getDb();
		t.after(async () => {
			assert.equal(db.databaseName, database);
			await db.dropDatabase();
			await (await globalThis.__lauchgruenMongoClient)?.close();
		});
		const options = (id) => ({ tournamentId: id, teams, matchPrefix: id });
		const draw = async (id, extra = {}) => swiss.drawNextSwissTeam({ ...options(id), expectedUpdatedAt: (await swiss.getSwissStageState(id)).updatedAt, ...extra });

		await t.test("one click is one team, seven empty slots and zero scheduled matches", async () => {
			const result = await draw("single");
			assert.ok(result.drawn.teamKey);
			assert.equal(result.state.rounds[0].drawPools[0].drawOrder.length, 1);
			assert.equal(result.state.rounds[0].drawPools[0].slots.filter(Boolean).length, 1);
			assert.equal(result.state.rounds[0].pairings.length, 0);
			assert.equal(await db.collection("tournament_matches").countDocuments(), 0);
			assert.deepEqual((await swiss.getSwissStageState("single")).rounds, result.state.rounds);
			await assert.rejects(() => swiss.drawNextSwissTeam({ ...options("single"), expectedUpdatedAt: epoch }), { code: "draw-conflict" });
		});

		await t.test("two administrators cannot fill the same slot or consume two teams", async () => {
			const outcomes = await Promise.allSettled(Array.from({ length: 2 }, () => swiss.drawNextSwissTeam({ ...options("race"), expectedUpdatedAt: epoch })));
			assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
			assert.equal(outcomes.find((outcome) => outcome.status === "rejected").reason.code, "draw-conflict");
			assert.equal((await swiss.getSwissStageState("race")).rounds[0].drawPools[0].drawOrder.length, 1);
			const revision = (await swiss.getSwissStageState("race")).updatedAt;
			await draw("race");
			await assert.rejects(() => swiss.resetLatestSwissRound("race", revision), { code: "draw-conflict" });
			await assert.rejects(() => swiss.resetSwissStage("race", "race", revision), { code: "draw-conflict" });
			assert.equal((await swiss.getSwissStageState("race")).rounds[0].drawPools[0].drawOrder.length, 2);
		});

		await t.test("twenty four-round tournaments keep records, opponents, scheduling and eight seeds consistent", async () => {
			for (let run = 0; run < 20; run++) {
				const id = `complete-${run}`;
				let state = await swiss.getSwissStageState(id);
				const opponents = new Set();
				for (let round = 1; round <= 4; round++) {
					do {
						try {
							state = (await draw(id)).state;
						} catch (error) {
							assert.equal(round, 4);
							assert.equal(error.code, "rematch-required");
							assert.ok(error.rematchPairs.length);
							state = (await draw(id, { allowPlacementRematch: true })).state;
						}
					} while (!state.rounds.at(-1).complete);
					const current = state.rounds.at(-1);
					assert.equal(current.round, round);
					assert.equal(current.pairings.length, round === 4 ? 2 : 4);
					assert.equal(new Set(current.pairings.flatMap((pair) => [pair.teamAKey, pair.teamBKey])).size, round === 4 ? 4 : 8);
					for (const pair of current.pairings) {
						assert.equal(pair.recordA, pair.recordB);
						assert.equal(pair.id, `${id}-r${round}-m${pair.slot}`);
						const key = [pair.teamAKey, pair.teamBKey].sort().join(":");
						if (round < 4) assert.ok(!opponents.has(key), `unexpected rematch ${key}`);
						opponents.add(key);
						assert.equal((await db.collection("tournament_matches").findOne({ _id: pair.id })).status, "Scheduled");
						const winner = (run + round + pair.slot) % 2 ? pair.teamAKey : pair.teamBKey;
						await swiss.setSwissPairingWinner(id, pair.id, winner);
					}
					state = await swiss.getSwissStageState(id);
				}
				const seeds = swissPotSeeds(swissStageToPotState(state, teams));
				assert.deepEqual(
					seeds.map((entry) => entry.seed),
					[1, 2, 3, 4, 5, 6, 7, 8]
				);
				assert.equal(new Set(seeds.map((entry) => entry.teamKey)).size, 8);
				const namedSeeds = Object.fromEntries(seeds.map((entry) => [entry.seed, teams.find((team) => team.key === entry.teamKey).name]));
				assert.deepEqual(computeUltimateBraverySwissSeeds(state, teams, 4), namedSeeds);
				const playoffs = resolveUltimateBraveryPlayoffMatches({ format: "double-elimination", swiss: state, teams, requiredRounds: 4, stored: {} });
				assert.deepEqual(
					playoffs.slice(0, 4).map((match) => [match.teamAName, match.teamBName]),
					[
						[namedSeeds[1], namedSeeds[8]],
						[namedSeeds[4], namedSeeds[5]],
						[namedSeeds[2], namedSeeds[7]],
						[namedSeeds[3], namedSeeds[6]],
					]
				);
				assert.equal(await db.collection("tournament_matches").countDocuments({ id: new RegExp(`^${id}-`) }), 14);
				await assert.rejects(() => draw(id), /abgeschlossen/);
			}
		});

		await t.test("seeded opening stays deterministic and later draws synchronize actual match scores", async () => {
			const order = teams.map((team) => team.key);
			let state = (await draw("seeded", { roundOneOrder: order })).state;
			assert.equal(state.rounds[0].complete, true);
			assert.equal(state.rounds[0].drawPools[0].automatic, true);
			assert.deepEqual(
				state.rounds[0].pairings.map((pair) => [pair.teamAKey, pair.teamBKey]),
				Array.from({ length: 4 }, (_, i) => [order[i], order[i + 4]])
			);
			await assert.rejects(() => draw("seeded"), /Sieger/);
			for (const pair of state.rounds[0].pairings)
				await db.collection("tournament_matches").updateOne({ id: pair.id }, { $set: { status: "Completed", scoreA: 1, scoreB: 0 } });
			state = (await draw("seeded", { syncMatchResults: true, bestOf: 1 })).state;
			assert.ok(state.rounds[0].pairings.every((pair) => pair.winnerTeamKey === pair.teamAKey));
			assert.equal(state.rounds[1].drawPools[0].drawOrder.length, 1);
			await assert.rejects(() => swiss.setSwissPairingWinner("seeded", state.rounds[0].pairings[0].id, order[4]), /nächste Runde/);
		});

		await t.test("a completed legacy round can continue without rewriting its matches", async () => {
			let legacy;
			do {
				legacy = await swiss.drawNextSwissMatchup({ ...options("legacy"), maximumRounds: 4, pairByRecord: true, placementSwiss: true });
			} while (!legacy.round.complete);
			for (const pair of legacy.round.pairings) await swiss.setSwissPairingWinner("legacy", pair.id, pair.teamAKey);
			const oldRound = (await swiss.getSwissStageState("legacy")).rounds[0];
			const state = (await draw("legacy")).state;
			assert.deepEqual(state.rounds[0], oldRound);
			assert.equal(state.rounds[1].drawPools[0].drawOrder.length, 1);
		});

		await t.test("results of different matches in one round saved at the same time all persist", async () => {
			const state = (await draw("parallel-results", { roundOneOrder: teams.map((team) => team.key) })).state;
			const pairs = state.rounds[0].pairings;
			const outcomes = await Promise.allSettled(pairs.map((pair) => swiss.setSwissPairingWinner("parallel-results", pair.id, pair.teamAKey)));
			assert.deepEqual(
				outcomes.map((outcome) => outcome.status),
				pairs.map(() => "fulfilled")
			);
			const saved = (await swiss.getSwissStageState("parallel-results")).rounds[0].pairings;
			assert.deepEqual(
				saved.map((pair) => pair.winnerTeamKey),
				pairs.map((pair) => pair.teamAKey)
			);
			await Promise.all(pairs.slice(0, 2).map((pair) => swiss.clearSwissPairingWinner("parallel-results", pair.id)));
			assert.deepEqual(
				(await swiss.getSwissStageState("parallel-results")).rounds[0].pairings.map((pair) => pair.winnerTeamKey ?? null),
				[null, null, pairs[2].teamAKey, pairs[3].teamAKey]
			);
		});

		await t.test("two draws against the same existing revision consume exactly one team", async () => {
			await draw("existing-race");
			const before = await swiss.getSwissStageState("existing-race");
			const outcomes = await Promise.allSettled(
				Array.from({ length: 3 }, () => swiss.drawNextSwissTeam({ ...options("existing-race"), expectedUpdatedAt: before.updatedAt }))
			);
			assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
			assert.ok(outcomes.filter((outcome) => outcome.status === "rejected").every((outcome) => outcome.reason.code === "draw-conflict"));
			const after = await swiss.getSwissStageState("existing-race");
			assert.equal(after.rounds[0].drawPools[0].drawOrder.length, before.rounds[0].drawPools[0].drawOrder.length + 1);
			assert.deepEqual(after.rounds[0].drawPools[0].drawOrder.slice(0, -1), before.rounds[0].drawPools[0].drawOrder);
		});

		await t.test("confirming a winner that a synced draw already stored is not an error", async () => {
			const order = teams.map((team) => team.key);
			let state = (await draw("synced-confirm", { roundOneOrder: order })).state;
			const pairs = state.rounds[0].pairings;
			for (const pair of pairs) await db.collection("tournament_matches").updateOne({ id: pair.id }, { $set: { status: "Finished", scoreA: 1, scoreB: 0 } });
			state = (await draw("synced-confirm", { syncMatchResults: true, bestOf: 1 })).state;
			assert.equal(state.rounds.length, 2);
			// The match route calls this right after saving the match document; the draw got there first.
			for (const pair of pairs) await swiss.setSwissPairingWinner("synced-confirm", pair.id, pair.teamAKey);
			await assert.rejects(() => swiss.setSwissPairingWinner("synced-confirm", pairs[0].id, pairs[0].teamBKey), /nächste Runde/);
		});

		await t.test("a forced placement rematch needs approval tied to the shown revision and still yields seeds 1-8", async () => {
			const id = "forced-rematch";
			const team = (number) => teams[number - 1];
			const label = (record) => `${record.wins}-${record.losses}`;
			const records = new Map(teams.map((entry) => [entry.key, { wins: 0, losses: 0 }]));
			const history = [
				[
					[1, 2, 2],
					[3, 4, 4],
					[5, 6, 6],
					[7, 8, 8],
				],
				[
					[1, 3, 1],
					[2, 4, 4],
					[5, 7, 7],
					[6, 8, 8],
				],
				[
					[1, 6, 6],
					[2, 7, 7],
					[3, 5, 5],
					[4, 8, 8],
				],
			];
			const rounds = history.map((results, index) => {
				const pairings = results.map(([a, b, winner], slot) => ({
					id: `${id}-r${index + 1}-m${slot + 1}`,
					round: index + 1,
					slot: slot + 1,
					teamAKey: team(a).key,
					teamAName: team(a).name,
					teamBKey: team(b).key,
					teamBName: team(b).name,
					recordA: label(records.get(team(a).key)),
					recordB: label(records.get(team(b).key)),
					bye: false,
					winnerTeamKey: team(winner).key,
				}));
				for (const [a, b, winner] of results)
					for (const number of [a, b]) {
						const record = records.get(team(number).key);
						if (number === winner) record.wins++;
						else record.losses++;
					}
				return { round: index + 1, pairings, complete: true, drawnAt: epoch };
			});
			assert.ok(rounds.every((round) => round.pairings.every((pair) => pair.recordA === pair.recordB)));
			await db.collection("tournament_swiss_stages").insertOne({ _id: id, tournamentId: id, rounds, updatedAt: "2026-11-13T10:00:00.000Z" });

			const shown = await swiss.getSwissStageState(id);
			await assert.rejects(() => draw(id), { code: "rematch-required" });
			assert.deepEqual(await swiss.getSwissStageState(id), shown, "A refused rematch writes nothing");
			assert.equal(await db.collection("tournament_matches").countDocuments({ id: new RegExp(`^${id}-r4`) }), 0);

			await swiss.setSwissPairingWinner(id, rounds[2].pairings[0].id, rounds[2].pairings[0].winnerTeamKey);
			await db.collection("tournament_swiss_stages").updateOne({ _id: id }, { $set: { updatedAt: "2026-11-13T10:05:00.000Z" } });
			await assert.rejects(
				() => swiss.drawNextSwissTeam({ ...options(id), expectedUpdatedAt: shown.updatedAt, allowPlacementRematch: true }),
				{ code: "draw-conflict" },
				"An approval dialog opened on an older revision cannot approve a newer state"
			);

			let state = (await draw(id, { allowPlacementRematch: true })).state;
			const fourth = state.rounds[3];
			assert.equal(fourth.complete, true);
			assert.deepEqual(
				fourth.pairings.map((pair) => [pair.recordA, pair.recordB]),
				[
					["2-1", "2-1"],
					["1-2", "1-2"],
				]
			);
			assert.ok(fourth.drawPools.some((pool) => pool.rematchApproved));
			assert.ok(
				fourth.pairings.every((pair) => pair.teamBKey && !rounds[2].pairings.some((old) => [old.teamAKey, old.teamBKey].includes(pair.teamAKey) && old.recordA !== "1-1"))
			);
			for (const pair of fourth.pairings) {
				assert.equal((await db.collection("tournament_matches").findOne({ _id: pair.id })).status, "Scheduled");
				await swiss.setSwissPairingWinner(id, pair.id, pair.teamAKey);
			}
			state = await swiss.getSwissStageState(id);
			const seeds = swissPotSeeds(swissStageToPotState(state, teams));
			assert.deepEqual(
				seeds.map((entry) => entry.seed),
				[1, 2, 3, 4, 5, 6, 7, 8]
			);
			const named = Object.fromEntries(seeds.map((entry) => [entry.seed, teams.find((candidate) => candidate.key === entry.teamKey).name]));
			assert.equal(named[1], team(8).name, "2-0 decider winner is seed 1");
			assert.equal(named[2], team(4).name);
			assert.equal(named[7], team(5).name, "0-2 decider winner is seed 7");
			assert.equal(named[8], team(3).name);
			assert.deepEqual(computeUltimateBraverySwissSeeds(state, teams, 4), named);
			const playoffs = resolveUltimateBraveryPlayoffMatches({ format: "double-elimination", swiss: state, teams, requiredRounds: 4, stored: {} });
			assert.deepEqual(
				playoffs.slice(0, 4).map((match) => [match.teamAName, match.teamBName]),
				[
					[named[1], named[8]],
					[named[4], named[5]],
					[named[2], named[7]],
					[named[3], named[6]],
				]
			);
		});

		await t.test("a new draw never adopts a leftover started match document with the same ID", async () => {
			await db.collection("tournament_matches").insertOne({ _id: "leftover-r1-m1", id: "leftover-r1-m1", status: "Finished", scoreA: 1, scoreB: 0 });
			await assert.rejects(() => draw("leftover", { roundOneOrder: teams.map((team) => team.key) }), /leftover-r1-m1/);
			assert.equal(await db.collection("tournament_swiss_stages").countDocuments({ _id: "leftover" }), 0, "Nothing was drawn or saved");
			assert.equal((await db.collection("tournament_matches").findOne({ _id: "leftover-r1-m1" })).status, "Finished");
			await db.collection("tournament_matches").insertOne({ _id: "untouched-r1-m1", id: "untouched-r1-m1", status: "Scheduled" });
			const state = (await draw("untouched", { roundOneOrder: teams.map((team) => team.key) })).state;
			assert.equal(state.rounds[0].pairings.length, 4, "An untouched scheduled leftover is equivalent to a fresh match and may be reused");
		});

		await t.test("match outbox recovers interrupted creation without overwriting existing match results", async () => {
			await db
				.collection("tournament_swiss_stages")
				.insertOne({ _id: "outbox", tournamentId: "outbox", rounds: [], updatedAt: epoch, scheduledMatchOutbox: ["outbox-r1-m1", "outbox-r1-m2"] });
			await db.collection("tournament_matches").insertOne({ _id: "outbox-r1-m1", id: "outbox-r1-m1", status: "Completed", scoreA: 1 });
			await swiss.getSwissStageState("outbox");
			assert.equal((await db.collection("tournament_matches").findOne({ _id: "outbox-r1-m1" })).status, "Completed");
			assert.equal((await db.collection("tournament_matches").findOne({ _id: "outbox-r1-m2" })).status, "Scheduled");
			assert.deepEqual((await db.collection("tournament_swiss_stages").findOne({ _id: "outbox" })).scheduledMatchOutbox, []);
		});

		await t.test("redrawing removes pending match creation and cannot resurrect deleted matches", async () => {
			const state = (await draw("redraw-outbox", { roundOneOrder: teams.map((team) => team.key) })).state;
			const ids = state.rounds[0].pairings.map((pair) => pair.id);
			await db.collection("tournament_swiss_stages").updateOne({ _id: "redraw-outbox" }, { $set: { scheduledMatchOutbox: ids } });
			await db.collection("tournament_matches").deleteOne({ _id: ids[0] });
			const reset = await swiss.resetLatestSwissRound("redraw-outbox", state.updatedAt);
			assert.equal(reset.rounds.length, 0);
			assert.deepEqual(reset.drawEvents, []);
			assert.equal(await db.collection("tournament_matches").countDocuments({ _id: { $in: ids } }), 0);
			assert.deepEqual((await db.collection("tournament_swiss_stages").findOne({ _id: "redraw-outbox" })).scheduledMatchOutbox, []);
		});
	}
);
