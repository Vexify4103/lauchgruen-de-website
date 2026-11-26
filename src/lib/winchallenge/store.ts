/**
 * Win Challenge data access (MongoDB, collections `winchallenge_*`). Plan: docs/winchallenge-plan.md §11.
 * Team writes use compare-and-swap on `version`, so two partners pressing at once never lose a click.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";
import { slugifyTournamentId } from "@/lib/tournament-archive-shared";
import { checkTeamName } from "@/lib/team-name-filter";
import { applyTeamAction, settleFinish, WinActionError, type WinTeamAction } from "@/lib/winchallenge/actions";
import { generateJoinCode, normalizeJoinCode } from "@/lib/winchallenge/join-code";
import { assignPayouts } from "@/lib/winchallenge/payout";
import { rankTeams } from "@/lib/winchallenge/ranking";
import type { WinChallenge, WinGame, WinParticipant, WinPayout, WinPayoutStatus, WinTeam, WinTeamStatus } from "@/lib/winchallenge/types";

const CHALLENGES = "winchallenge_challenges";
const PARTICIPANTS = "winchallenge_participants";
const TEAMS = "winchallenge_teams";
const PAYOUTS = "winchallenge_payouts";
const EVENTS = "winchallenge_events";

type Doc<T extends { id: string }> = Omit<T, "id"> & { _id: string };

export type WinEvent = {
	id: string;
	challengeId: string;
	teamId?: string;
	at: string;
	actor: string;
	kind: string;
	gameId?: string;
	before?: unknown;
	after?: unknown;
	reason?: string;
	liveCheck?: "live" | "offline" | "twitch-down";
};

const g = globalThis as unknown as { __winIndexes?: Promise<unknown> };

async function db() {
	const database = await getDb();
	g.__winIndexes ??= Promise.all([
		database.collection(PARTICIPANTS).createIndex({ challengeId: 1, discordId: 1 }, { unique: true }),
		database.collection(TEAMS).createIndex({ challengeId: 1, joinCode: 1 }, { unique: true }),
		database.collection(TEAMS).createIndex({ challengeId: 1, slug: 1 }, { unique: true }),
		database.collection(PAYOUTS).createIndex({ challengeId: 1, payerId: 1 }, { unique: true }),
		database.collection(EVENTS).createIndex({ challengeId: 1, at: -1 }),
	]).catch((error) => {
		g.__winIndexes = undefined;
		throw error;
	});
	await g.__winIndexes;
	return database;
}

function fromDoc<T extends { id: string }>(doc: Doc<T> | null): T | null {
	if (!doc) return null;
	const { _id, ...rest } = doc;
	return { ...(rest as unknown as Omit<T, "id">), id: _id } as T;
}

function isDuplicateKey(error: unknown): boolean {
	return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

const RESERVED_SLUGS = new Set(["leaderboard", "admin", "mitmachen", "team", "teams", "control", "steuerung", "overlay", "auszahlung"]);

export class WinStoreError extends WinActionError {}

/* ------------------------------------------------------------------ challenge */

/** The current challenge: the newest one that is not archived. Null before the first one is created. */
export async function getCurrentChallenge(): Promise<WinChallenge | null> {
	const doc = await (await db())
		.collection<Doc<WinChallenge>>(CHALLENGES)
		.find({ status: { $ne: "archived" } })
		.sort({ createdAt: -1 })
		.limit(1)
		.next();
	return fromDoc<WinChallenge>(doc);
}

export type ChallengeInput = Pick<WinChallenge, "name" | "startAt" | "signupOpen" | "split" | "games"> & { status?: WinChallenge["status"] };

export async function saveChallenge(input: ChallengeInput, existingId?: string): Promise<WinChallenge> {
	const database = await db();
	const now = new Date().toISOString();
	if (existingId) {
		const updated = await database.collection<Doc<WinChallenge>>(CHALLENGES).findOneAndUpdate(
			{ _id: existingId },
			{ $set: { name: input.name, startAt: input.startAt, signupOpen: input.signupOpen, split: input.split, games: input.games, ...(input.status ? { status: input.status } : {}), updatedAt: now } },
			{ returnDocument: "after" }
		);
		if (!updated) throw new WinStoreError("not-found", "Challenge nicht gefunden.");
		return fromDoc<WinChallenge>(updated)!;
	}
	const challenge: Doc<WinChallenge> = {
		_id: randomUUID(),
		slug: slugifyTournamentId(input.name) || "winchallenge",
		name: input.name,
		startAt: input.startAt,
		status: input.status ?? "open",
		signupOpen: input.signupOpen,
		split: input.split,
		games: input.games,
		createdAt: now,
		updatedAt: now,
	};
	await database.collection<Doc<WinChallenge>>(CHALLENGES).insertOne(challenge);
	return fromDoc<WinChallenge>(challenge)!;
}

/* ------------------------------------------------------------------ events */

export async function logEvent(event: Omit<WinEvent, "id" | "at"> & { at?: string }): Promise<void> {
	await (await db())
		.collection<Doc<WinEvent>>(EVENTS)
		.insertOne({ ...event, _id: randomUUID(), at: event.at ?? new Date().toISOString() })
		.catch((error) => console.warn("[winchallenge] Event nicht gespeichert:", error));
}

export async function listEvents(challengeId: string, options: { kinds?: string[]; teamId?: string; limit?: number } = {}): Promise<WinEvent[]> {
	const filter: Record<string, unknown> = { challengeId };
	if (options.kinds) filter.kind = { $in: options.kinds };
	if (options.teamId) filter.teamId = options.teamId;
	const docs = await (await db())
		.collection<Doc<WinEvent>>(EVENTS)
		.find(filter)
		.sort({ at: -1 })
		.limit(options.limit ?? 50)
		.toArray();
	return docs.map((doc) => fromDoc<WinEvent>(doc)!);
}

/* ------------------------------------------------------------------ participants */

export async function getParticipantByDiscord(challengeId: string, discordId: string): Promise<WinParticipant | null> {
	return fromDoc<WinParticipant>(await (await db()).collection<Doc<WinParticipant>>(PARTICIPANTS).findOne({ challengeId, discordId }));
}

export async function listParticipants(challengeId: string): Promise<WinParticipant[]> {
	const docs = await (await db()).collection<Doc<WinParticipant>>(PARTICIPANTS).find({ challengeId }).sort({ createdAt: 1 }).toArray();
	return docs.map((doc) => fromDoc<WinParticipant>(doc)!);
}

export async function signUp(input: { challenge: WinChallenge; discordId: string; discordName: string; twitchId: string; twitchLogin: string }): Promise<WinParticipant> {
	if (!input.challenge.signupOpen || input.challenge.status !== "open") throw new WinStoreError("signup-closed", "Die Anmeldung ist gerade geschlossen.");
	const now = new Date().toISOString();
	const doc: Doc<WinParticipant> = {
		_id: randomUUID(),
		challengeId: input.challenge.id,
		discordId: input.discordId,
		discordName: input.discordName,
		twitchId: input.twitchId,
		twitchLogin: input.twitchLogin,
		acceptedRulesAt: now,
		createdAt: now,
	};
	try {
		await (await db()).collection<Doc<WinParticipant>>(PARTICIPANTS).insertOne(doc);
	} catch (error) {
		if (isDuplicateKey(error)) return (await getParticipantByDiscord(input.challenge.id, input.discordId))!;
		throw error;
	}
	await logEvent({ challengeId: input.challenge.id, actor: input.discordName, kind: "signup" });
	return fromDoc<WinParticipant>(doc)!;
}

export async function setWishChannel(participantId: string, wishChannel: string | null): Promise<void> {
	await (await db())
		.collection<Doc<WinParticipant>>(PARTICIPANTS)
		.updateOne({ _id: participantId }, wishChannel ? { $set: { wishChannel } } : { $unset: { wishChannel: "" } });
}

/** Keeps the stored Twitch login current, e.g. after a relink. */
export async function syncParticipantTwitch(participantId: string, twitchId: string, twitchLogin: string): Promise<void> {
	await (await db()).collection<Doc<WinParticipant>>(PARTICIPANTS).updateOne({ _id: participantId }, { $set: { twitchId, twitchLogin } });
}

/* ------------------------------------------------------------------ teams */

export async function listTeams(challengeId: string): Promise<WinTeam[]> {
	const docs = await (await db()).collection<Doc<WinTeam>>(TEAMS).find({ challengeId }).toArray();
	return docs.map((doc) => fromDoc<WinTeam>(doc)!);
}

export async function getTeam(teamId: string): Promise<WinTeam | null> {
	return fromDoc<WinTeam>(await (await db()).collection<Doc<WinTeam>>(TEAMS).findOne({ _id: teamId }));
}

export async function getTeamBySlug(challengeId: string, slug: string): Promise<WinTeam | null> {
	return fromDoc<WinTeam>(await (await db()).collection<Doc<WinTeam>>(TEAMS).findOne({ challengeId, slug }));
}

function teamNameProblem(name: string): string | null {
	const trimmed = name.trim();
	if (trimmed.length < 2 || trimmed.length > 40) return "Der Teamname braucht 2 bis 40 Zeichen.";
	if (!checkTeamName(trimmed).ok) return "Dieser Teamname ist nicht erlaubt. Bitte wähle einen anderen.";
	return null;
}

export async function createTeam(input: { challenge: WinChallenge; participant: WinParticipant; name: string; actor: string }): Promise<WinTeam> {
	if (input.participant.teamId) throw new WinStoreError("has-team", "Du bist schon in einem Team.");
	const problem = teamNameProblem(input.name);
	if (problem) throw new WinStoreError("bad-name", problem);
	const database = await db();
	const name = input.name.trim();
	// Reserved words are page or overlay routes that sit next to the team pages.
	const rawSlug = slugifyTournamentId(name) || "team";
	const baseSlug = RESERVED_SLUGS.has(rawSlug) ? `team-${rawSlug}` : rawSlug;
	const now = new Date().toISOString();
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const doc: Doc<WinTeam> = {
			_id: randomUUID(),
			challengeId: input.challenge.id,
			slug: attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`,
			name,
			joinCode: generateJoinCode(),
			memberIds: [input.participant.id],
			status: "forming",
			segments: [],
			adjustMs: 0,
			progress: {},
			version: 0,
			createdAt: now,
			updatedAt: now,
		};
		try {
			await database.collection<Doc<WinTeam>>(TEAMS).insertOne(doc);
		} catch (error) {
			if (isDuplicateKey(error)) continue;
			throw error;
		}
		const claimed = await database
			.collection<Doc<WinParticipant>>(PARTICIPANTS)
			.updateOne({ _id: input.participant.id, teamId: { $exists: false } }, { $set: { teamId: doc._id } });
		if (claimed.modifiedCount === 0) {
			await database.collection<{ _id: string }>(TEAMS).deleteOne({ _id: doc._id });
			throw new WinStoreError("has-team", "Du bist schon in einem Team.");
		}
		await logEvent({ challengeId: input.challenge.id, teamId: doc._id, actor: input.actor, kind: "team-create", after: { name } });
		return fromDoc<WinTeam>(doc)!;
	}
	throw new WinStoreError("busy", "Team konnte nicht angelegt werden. Bitte nochmal versuchen.");
}

export async function joinTeam(input: { challenge: WinChallenge; participant: WinParticipant; code: string; actor: string }): Promise<WinTeam> {
	if (input.participant.teamId) throw new WinStoreError("has-team", "Du bist schon in einem Team. Verlasse es zuerst.");
	const code = normalizeJoinCode(input.code);
	if (!code) throw new WinStoreError("bad-code", "Der Code hat 6 Zeichen (A–Z, 2–9).");
	const database = await db();
	const teams = database.collection<Doc<WinTeam>>(TEAMS);
	const joined = await teams.findOneAndUpdate(
		{ challengeId: input.challenge.id, joinCode: code, status: "forming", "memberIds.1": { $exists: false }, memberIds: { $ne: input.participant.id } },
		{ $push: { memberIds: input.participant.id }, $set: { status: "ready", updatedAt: new Date().toISOString() }, $inc: { version: 1 } },
		{ returnDocument: "after" }
	);
	if (!joined) throw new WinStoreError("no-team", "Kein offenes Team mit diesem Code gefunden.");
	const claimed = await database
		.collection<Doc<WinParticipant>>(PARTICIPANTS)
		.updateOne({ _id: input.participant.id, teamId: { $exists: false } }, { $set: { teamId: joined._id } });
	if (claimed.modifiedCount === 0) {
		await teams.updateOne({ _id: joined._id }, { $pull: { memberIds: input.participant.id }, $set: { status: "forming" }, $inc: { version: 1 } });
		throw new WinStoreError("has-team", "Du bist schon in einem Team.");
	}
	await logEvent({ challengeId: input.challenge.id, teamId: joined._id, actor: input.actor, kind: "team-join" });
	return fromDoc<WinTeam>(joined)!;
}

/** Leaving works only before the team's timer started. The last member leaving deletes the team. */
export async function leaveTeam(input: { participant: WinParticipant; actor: string }): Promise<void> {
	const teamId = input.participant.teamId;
	if (!teamId) return;
	const database = await db();
	const teams = database.collection<Doc<WinTeam>>(TEAMS);
	const team = await teams.findOne({ _id: teamId });
	if (team && team.status !== "forming" && team.status !== "ready") throw new WinStoreError("started", "Euer Timer läuft schon. Teamänderungen nur noch über die Orga.");
	if (team) {
		const remaining = team.memberIds.filter((id) => id !== input.participant.id);
		const changed =
			remaining.length === 0
				? (await teams.deleteOne({ _id: teamId, version: team.version })).deletedCount
				: (
						await teams.updateOne(
							{ _id: teamId, version: team.version },
							{ $set: { memberIds: remaining, status: "forming", updatedAt: new Date().toISOString() }, $inc: { version: 1 } }
						)
					).modifiedCount;
		if (!changed) throw new WinStoreError("busy", "Das Team wurde gerade geändert. Bitte nochmal versuchen.");
	}
	await database.collection<Doc<WinParticipant>>(PARTICIPANTS).updateOne({ _id: input.participant.id }, { $unset: { teamId: "" } });
	await logEvent({ challengeId: input.participant.challengeId, teamId, actor: input.actor, kind: "team-leave" });
}

export async function regenerateJoinCode(team: WinTeam): Promise<string> {
	const teams = (await db()).collection<Doc<WinTeam>>(TEAMS);
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const joinCode = generateJoinCode();
		try {
			const result = await teams.updateOne({ _id: team.id }, { $set: { joinCode, updatedAt: new Date().toISOString() }, $inc: { version: 1 } });
			if (result.matchedCount === 0) throw new WinStoreError("no-team", "Team nicht gefunden.");
			return joinCode;
		} catch (error) {
			if (!isDuplicateKey(error)) throw error;
		}
	}
	throw new WinStoreError("busy", "Neuer Code konnte nicht erzeugt werden.");
}

/** Reads, applies and writes with CAS on `version`; retries when the partner wrote in between. */
export async function mutateTeam(teamId: string, change: (team: WinTeam) => WinTeam): Promise<{ before: WinTeam; after: WinTeam }> {
	const teams = (await db()).collection<Doc<WinTeam>>(TEAMS);
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const before = fromDoc<WinTeam>(await teams.findOne({ _id: teamId }));
		if (!before) throw new WinStoreError("no-team", "Team nicht gefunden.");
		const after = change(before);
		if (after === before) return { before, after };
		const { id, ...rest } = after;
		void id;
		const result = await teams.replaceOne({ _id: teamId, version: before.version }, { ...rest, version: before.version + 1 });
		if (result.modifiedCount === 1) return { before, after: { ...after, version: before.version + 1 } };
	}
	throw new WinStoreError("busy", "Gleichzeitige Änderung. Bitte nochmal drücken.");
}

export async function controlTeam(input: { team: WinTeam; challenge: WinChallenge; action: WinTeamAction; actor: string; liveCheck?: WinEvent["liveCheck"] }) {
	const result = await mutateTeam(input.team.id, (team) => applyTeamAction(team, input.action, { games: input.challenge.games, startAt: input.challenge.startAt, now: new Date() }));
	if (result.after !== result.before) {
		const gameId = "gameId" in input.action ? (input.action.gameId ?? undefined) : undefined;
		await logEvent({
			challengeId: input.challenge.id,
			teamId: input.team.id,
			actor: input.actor,
			kind: input.action.action,
			gameId,
			before: gameId ? input.team.progress[gameId] : input.team.status,
			after: gameId ? result.after.progress[gameId] : result.after.status,
			liveCheck: input.liveCheck,
		});
		const game = gameId ? input.challenge.games.find((entry) => entry.id === gameId) : undefined;
		if (game && result.after.progress[game.id]?.doneAt && !result.before.progress[game.id]?.doneAt) {
			await logEvent({ challengeId: input.challenge.id, teamId: input.team.id, actor: input.actor, kind: "game-done", gameId: game.id });
		}
		if (result.after.status === "finished" && result.before.status !== "finished") {
			await logEvent({ challengeId: input.challenge.id, teamId: input.team.id, actor: input.actor, kind: "team-finished", after: { finalMs: result.after.finalMs } });
		}
	}
	return result.after;
}

/* ------------------------------------------------------------------ admin */

export type TeamCorrection = {
	adjustMs?: number;
	status?: WinTeamStatus;
	progress?: Record<string, { count: number; tries: number; done: boolean }>;
	name?: string;
};

export async function correctTeam(input: { teamId: string; challenge: WinChallenge; correction: TeamCorrection; reason: string; actor: string }): Promise<WinTeam> {
	const now = new Date().toISOString();
	const { before, after } = await mutateTeam(input.teamId, (team) => {
		let next: WinTeam = { ...team, progress: { ...team.progress }, updatedAt: now };
		if (input.correction.name !== undefined) next.name = input.correction.name.trim();
		if (input.correction.adjustMs !== undefined) next.adjustMs = input.correction.adjustMs;
		if (input.correction.progress) {
			for (const [gameId, value] of Object.entries(input.correction.progress)) {
				const previous = team.progress[gameId];
				next.progress[gameId] = { count: value.count, tries: value.tries, ...(value.done ? { doneAt: previous?.doneAt ?? now } : {}) };
			}
		}
		if (input.correction.status && input.correction.status !== team.status) {
			const target = input.correction.status;
			const segments = [...team.segments];
			const open = segments.at(-1) && !segments.at(-1)!.end;
			if (target === "running" && !open) segments.push({ start: now });
			if (target !== "running" && open) segments[segments.length - 1] = { ...segments.at(-1)!, end: now };
			next = { ...next, status: target, segments };
			if (target !== "finished") {
				delete next.finalMs;
				delete next.finishedAt;
			}
		}
		const settled = settleFinish(next, team, input.challenge.games, now);
		// A finished team's frozen time follows later corrections of adjustMs.
		if (settled.status === "finished" && input.correction.adjustMs !== undefined && team.status === "finished") {
			delete settled.finalMs;
			const base = settled.segments.reduce((sum, segment) => sum + Math.max(0, new Date(segment.end ?? now).getTime() - new Date(segment.start).getTime()), 0);
			settled.finalMs = Math.max(0, base + settled.adjustMs);
		}
		return settled;
	});
	await logEvent({ challengeId: input.challenge.id, teamId: input.teamId, actor: input.actor, kind: "admin", before: summarizeTeam(before), after: summarizeTeam(after), reason: input.reason });
	return after;
}

function summarizeTeam(team: WinTeam) {
	return { name: team.name, status: team.status, adjustMs: team.adjustMs, finalMs: team.finalMs, progress: team.progress };
}

export async function removeTeam(input: { team: WinTeam; actor: string; reason: string }): Promise<void> {
	const database = await db();
	await database.collection<{ _id: string }>(TEAMS).deleteOne({ _id: input.team.id });
	await database.collection<Doc<WinParticipant>>(PARTICIPANTS).updateMany({ teamId: input.team.id }, { $unset: { teamId: "" } });
	await logEvent({ challengeId: input.team.challengeId, teamId: input.team.id, actor: input.actor, kind: "admin", before: summarizeTeam(input.team), reason: input.reason });
}

export async function removeParticipant(input: { participant: WinParticipant; actor: string; reason: string }): Promise<void> {
	const database = await db();
	if (input.participant.teamId) {
		const team = await database.collection<Doc<WinTeam>>(TEAMS).findOne({ _id: input.participant.teamId });
		if (team) {
			const remaining = team.memberIds.filter((id) => id !== input.participant.id);
			if (remaining.length === 0) await database.collection<{ _id: string }>(TEAMS).deleteOne({ _id: team._id });
			else
				await database.collection<Doc<WinTeam>>(TEAMS).updateOne(
					{ _id: team._id },
					{ $set: { memberIds: remaining, ...(team.status === "ready" ? { status: "forming" as const } : {}) }, $inc: { version: 1 } }
				);
		}
	}
	await database.collection<{ _id: string }>(PARTICIPANTS).deleteOne({ _id: input.participant.id });
	await logEvent({ challengeId: input.participant.challengeId, actor: input.actor, kind: "admin", before: { participant: input.participant.discordName }, reason: input.reason });
}

/* ------------------------------------------------------------------ end and payout */

/** Who owes a sub: members of teams that started (also those that gave up). */
export function payersFor(teams: WinTeam[]) {
	return teams.filter((team) => team.segments.length > 0).flatMap((team) => team.memberIds.map((id) => ({ id, teamId: team.id })));
}

/**
 * Freezes the ranking and creates the sub assignments. Idempotent: a second call returns the stored
 * payouts and never changes them.
 */
export async function endChallenge(input: { challenge: WinChallenge; actor: string; channelFallback: string }): Promise<WinPayout[]> {
	const database = await db();
	const existing = await listPayouts(input.challenge.id);
	if (input.challenge.status === "ended" && existing.length > 0) return existing;
	const [teams, participants] = await Promise.all([listTeams(input.challenge.id), listParticipants(input.challenge.id)]);
	const now = new Date();
	// Running timers stop with the end of the challenge.
	for (const team of teams.filter((entry) => entry.status === "running")) {
		await mutateTeam(team.id, (current) => applyTeamAction(current, { action: "pause" }, { games: input.challenge.games, startAt: input.challenge.startAt, now }));
	}
	const ranked = rankTeams(await listTeams(input.challenge.id), input.challenge.games, now.getTime());
	const places = ranked.filter((row) => row.team.status === "finished").map((row) => ({ teamId: row.team.id, memberIds: row.team.memberIds }));
	const assignments = assignPayouts(payersFor(teams), places, input.challenge.split);
	const byId = new Map(participants.map((participant) => [participant.id, participant]));
	const docs: Doc<WinPayout>[] = assignments.map((assignment) => ({
		_id: randomUUID(),
		challengeId: input.challenge.id,
		payerId: assignment.payerId,
		recipientId: assignment.recipientId,
		place: assignment.place,
		channel: byId.get(assignment.recipientId)?.wishChannel || input.channelFallback,
		status: "open",
	}));
	if (docs.length) await database.collection<Doc<WinPayout>>(PAYOUTS).insertMany(docs, { ordered: false }).catch((error) => {
		if (!isDuplicateKey(error)) throw error;
	});
	await database.collection<Doc<WinChallenge>>(CHALLENGES).updateOne(
		{ _id: input.challenge.id },
		{ $set: { status: "ended", signupOpen: false, endedAt: now.toISOString(), finalRanking: ranked.map((row) => row.team.id), updatedAt: now.toISOString() } }
	);
	await logEvent({ challengeId: input.challenge.id, actor: input.actor, kind: "challenge-ended", after: { payouts: docs.length } });
	return listPayouts(input.challenge.id);
}

export async function listPayouts(challengeId: string): Promise<WinPayout[]> {
	const docs = await (await db()).collection<Doc<WinPayout>>(PAYOUTS).find({ challengeId }).toArray();
	return docs.map((doc) => fromDoc<WinPayout>(doc)!);
}

export async function setPayoutStatus(input: { payoutId: string; status: WinPayoutStatus; actor: string; challengeId: string; allowedFrom?: WinPayoutStatus[] }): Promise<WinPayout | null> {
	const now = new Date().toISOString();
	const filter: Record<string, unknown> = { _id: input.payoutId, challengeId: input.challengeId };
	if (input.allowedFrom) filter.status = { $in: input.allowedFrom };
	const set: Record<string, unknown> = { status: input.status };
	if (input.status === "paid") set.paidAt = now;
	if (input.status === "confirmed") Object.assign(set, { confirmedAt: now, confirmedBy: input.actor });
	const updated = await (await db()).collection<Doc<WinPayout>>(PAYOUTS).findOneAndUpdate(filter, { $set: set }, { returnDocument: "after" });
	if (updated) await logEvent({ challengeId: input.challengeId, actor: input.actor, kind: "payout", after: { id: input.payoutId, status: input.status } });
	return fromDoc<WinPayout>(updated);
}

export async function reassignPayout(input: { payoutId: string; challengeId: string; recipientId: string; channel: string; actor: string }): Promise<void> {
	await (await db())
		.collection<Doc<WinPayout>>(PAYOUTS)
		.updateOne({ _id: input.payoutId, challengeId: input.challengeId }, { $set: { recipientId: input.recipientId, channel: input.channel, status: "open" }, $unset: { paidAt: "", confirmedAt: "", confirmedBy: "" } });
	await logEvent({ challengeId: input.challengeId, actor: input.actor, kind: "payout", after: { id: input.payoutId, recipientId: input.recipientId } });
}

export type { WinGame };
