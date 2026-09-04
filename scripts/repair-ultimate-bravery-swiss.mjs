import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

nextEnv.loadEnvConfig(process.cwd());

if (!process.argv.includes("--apply")) {
	throw new Error("One-time historical repair. Use --apply only when intentionally restoring the confirmed September 4 results.");
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing.");

const tournamentId = "ultimate-bravery";
const key = (name) => name.toLocaleLowerCase("de-DE");
const team = {
	recommended: "Recommended Items Off",
	weScale: "We Scale Eventually",
	born: "Born to Int",
	trust: "Trust the Randomizer",
	arbeitszeit: "Arbeitszeitbetruuuuug",
	dasSpieltMan: "Das Spielt man jetzt so",
	fullAp: "Full AP No Regrets",
	critYuumi: "Crit Yuumi Enjoyers",
};

const matches = [
	{ id: "swiss-r1-m1", round: 1, slot: 1, teamA: team.critYuumi, teamB: team.born, winner: team.born, duration: 37 * 60 + 37, recordA: "0-0", recordB: "0-0" },
	{ id: "swiss-r1-m2", round: 1, slot: 2, teamA: team.weScale, teamB: team.fullAp, winner: team.weScale, duration: 35 * 60 + 40, recordA: "0-0", recordB: "0-0" },
	{ id: "swiss-r1-m3", round: 1, slot: 3, teamA: team.dasSpieltMan, teamB: team.recommended, winner: team.recommended, duration: 32 * 60 + 37, recordA: "0-0", recordB: "0-0" },
	{ id: "swiss-r1-m4", round: 1, slot: 4, teamA: team.arbeitszeit, teamB: team.trust, winner: team.trust, duration: 35 * 60 + 9, recordA: "0-0", recordB: "0-0" },
	{ id: "swiss-r2-m1", round: 2, slot: 1, teamA: team.recommended, teamB: team.born, winner: team.recommended, duration: 22 * 60 + 43, recordA: "1-0", recordB: "1-0" },
	{ id: "swiss-r2-m2", round: 2, slot: 2, teamA: team.trust, teamB: team.weScale, winner: team.weScale, duration: 28 * 60 + 12, recordA: "1-0", recordB: "1-0" },
	{ id: "swiss-r2-m3", round: 2, slot: 3, teamA: team.dasSpieltMan, teamB: team.fullAp, winner: team.dasSpieltMan, duration: 31 * 60 + 9, recordA: "0-1", recordB: "0-1" },
	{ id: "swiss-r2-m4", round: 2, slot: 4, teamA: team.critYuumi, teamB: team.arbeitszeit, winner: team.arbeitszeit, duration: 24 * 60 + 39, recordA: "0-1", recordB: "0-1" },
	{ id: "swiss-r3-m1", round: 3, slot: 1, teamA: team.weScale, teamB: team.recommended, winner: team.recommended, duration: 22 * 60 + 32, recordA: "2-0", recordB: "2-0" },
	{ id: "swiss-r3-m2", round: 3, slot: 2, teamA: team.born, teamB: team.dasSpieltMan, winner: team.born, duration: 29 * 60 + 31, recordA: "1-1", recordB: "1-1" },
	{
		id: "swiss-r3-m3",
		round: 3,
		slot: 3,
		teamA: team.arbeitszeit,
		teamB: team.fullAp,
		winner: team.fullAp,
		duration: 33 * 60 + 5,
		recordA: "1-1",
		recordB: "0-2",
		integrityNote: "Die Teams kamen aus unterschiedlichen Score-Pools (1–1 und 0–2). Das Ergebnis bleibt bestehen.",
	},
	{
		id: "swiss-r3-m4",
		round: 3,
		slot: 4,
		teamA: team.trust,
		teamB: team.critYuumi,
		winner: team.trust,
		duration: 26 * 60 + 9,
		recordA: "1-1",
		recordB: "0-2",
		integrityNote: "Die Teams kamen aus unterschiedlichen Score-Pools (1–1 und 0–2). Das Ergebnis bleibt bestehen.",
	},
	{ id: "swiss-r4-m1", round: 4, slot: 1, teamA: team.born, teamB: team.trust, winner: team.born, duration: 30 * 60 + 52, recordA: "2-1", recordB: "2-1" },
	{ id: "swiss-r4-m2", round: 4, slot: 2, teamA: team.dasSpieltMan, teamB: team.arbeitszeit, winner: team.arbeitszeit, duration: 38 * 60 + 29, recordA: "1-2", recordB: "1-2" },
];

const allNames = Object.values(team);
const stats = new Map(allNames.map((name) => [name, { wins: 0, losses: 0, winDurationTotal: 0 }]));
for (const match of matches) {
	const loser = match.winner === match.teamA ? match.teamB : match.teamA;
	const winnerStats = stats.get(match.winner);
	const loserStats = stats.get(loser);
	winnerStats.wins += 1;
	winnerStats.winDurationTotal += match.duration;
	loserStats.losses += 1;
}

const fixedTopTwo = [team.recommended, team.weScale];
const remaining = allNames
	.filter((name) => !fixedTopTwo.includes(name))
	.sort((first, second) => {
		const a = stats.get(first);
		const b = stats.get(second);
		const aAverage = a.wins ? a.winDurationTotal / a.wins : Number.POSITIVE_INFINITY;
		const bAverage = b.wins ? b.winDurationTotal / b.wins : Number.POSITIVE_INFINITY;
		return b.wins - a.wins || aAverage - bAverage || first.localeCompare(second, "de");
	});
const orderedSeeds = [...fixedTopTwo, ...remaining];
const finalSeedNames = Object.fromEntries(orderedSeeds.map((name, index) => [index + 1, name]));

const expectedSeeds = [team.recommended, team.weScale, team.born, team.trust, team.arbeitszeit, team.dasSpieltMan, team.fullAp, team.critYuumi];
if (orderedSeeds.some((name, index) => name !== expectedSeeds[index])) throw new Error(`Unexpected seeding: ${orderedSeeds.join(", ")}`);

const now = new Date().toISOString();
const roundTimes = {
	1: "2026-09-04T16:16:11.531Z",
	2: "2026-09-04T17:33:56.926Z",
	3: "2026-09-04T18:22:31.164Z",
	4: now,
};
const stage = {
	_id: tournamentId,
	tournamentId,
	rounds: [1, 2, 3, 4].map((round) => ({
		round,
		pairings: matches
			.filter((match) => match.round === round)
			.map((match) => ({
				id: match.id,
				round,
				slot: match.slot,
				teamAKey: key(match.teamA),
				teamAName: match.teamA,
				teamBKey: key(match.teamB),
				teamBName: match.teamB,
				bye: false,
				recordA: match.recordA,
				recordB: match.recordB,
				winnerTeamKey: key(match.winner),
				...(match.integrityNote ? { integrityStatus: "faulty-pairing", integrityNote: match.integrityNote } : {}),
			})),
		pendingPairings: [],
		complete: true,
		drawnAt: roundTimes[round],
		drawnBy: round < 4 ? "lauchgruen" : "Turnierleitung",
	})),
	finalSeedNames,
	seedingMethod: "results-and-average-win-duration",
	seedingNote:
		"Seed #1 und #2 stammen aus dem direkten 2–0-Duell. Seeds #3 bis #8 wurden nach Siegen und anschließend nach der niedrigeren durchschnittlichen Dauer gewonnener Spiele sortiert.",
	updatedAt: now,
};

const client = await new MongoClient(uri).connect();
const db = client.db(process.env.MONGODB_DB ?? "lauchgruen");
const session = client.startSession();
let backupId;

try {
	await session.withTransaction(async () => {
		const previousStage = await db.collection("tournament_swiss_stages").findOne({ _id: tournamentId }, { session });
		const previousMatches = await db
			.collection("tournament_matches")
			.find({ id: /^swiss-r[1-4]-/ }, { session })
			.toArray();
		backupId = `swiss-real-results-repair-${now.replaceAll(":", "-").replaceAll(".", "-")}`;
		await db.collection("tournament_repair_backups").insertOne(
			{
				_id: backupId,
				createdAt: now,
				reason: "Rebuild Swiss stage from the 14 confirmed real match results and finalize fair playoff seeding.",
				stage: previousStage,
				matches: previousMatches,
			},
			{ session }
		);

		await db.collection("tournament_swiss_stages").replaceOne({ _id: tournamentId }, stage, { upsert: true, session });
		await db.collection("tournament_matches").deleteMany({ id: /^swiss-r[1-4]-tb-/ }, { session });

		for (const match of matches) {
			const scoreA = match.winner === match.teamA ? 1 : 0;
			const scoreB = match.winner === match.teamB ? 1 : 0;
			await db.collection("tournament_matches").updateOne(
				{ _id: match.id },
				{
					$set: {
						id: match.id,
						teamAName: match.teamA,
						teamBName: match.teamB,
						status: "Finished",
						scoreA,
						scoreB,
						winner: match.winner,
						gameDurationSeconds: match.duration,
						updatedAt: now,
					},
					$unset: {
						excludedFromSwissStandings: "",
						exclusionReason: "",
						isAdministrativeDecision: "",
						decisionMethod: "",
					},
				},
				{ upsert: true, session }
			);
		}

		const auditId = `${Date.now()}-${randomUUID()}`;
		await db.collection("tournament_swiss_audit").insertOne(
			{
				_id: auditId,
				tournamentId,
				action: "history-corrected",
				createdAt: now,
				actor: "Turnierleitung",
				detail: "Swiss-Historie aus 14 bestätigten realen Ergebnissen neu aufgebaut; zwei fehlerhafte R3-Paarungen markiert und Seeds finalisiert.",
				metadata: { backupId, finalSeedNames },
			},
			{ session }
		);
		await db.collection("tournament_audit_log").insertOne(
			{
				_id: auditId,
				id: auditId,
				action: "swiss.history-corrected",
				targetType: "swiss-stage",
				targetId: tournamentId,
				summary: "Swiss Stage aus bestätigten Ergebnissen wiederhergestellt und Playoff-Seeds finalisiert.",
				actorLabel: "Turnierleitung",
				metadata: { backupId, finalSeedNames },
				createdAt: now,
			},
			{ session }
		);
	});

	console.log(JSON.stringify({ backupId, matches: matches.length, finalSeedNames, stats: Object.fromEntries(stats) }, null, 2));
} finally {
	await session.endSession();
	await client.close();
}
