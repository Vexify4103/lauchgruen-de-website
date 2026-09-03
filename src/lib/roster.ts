/**
 * Server-side helpers for the admin roster builder.
 *
 * The roster builder lets owners view all applicants alongside the bot's
 * existing teams and re-assign players + roles in one atomic save. It writes
 * back to `bot_state.teams` so the Discord bot keeps working unchanged.
 */

import { getDb } from "@/lib/mongo";
import type { DiscordDirectMessagePayload } from "@/lib/discord";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
import { listApplications, listPreferenceGroups, type TournamentApplication } from "@/lib/tournament-storage";
import { isTestRosterModeActive } from "@/lib/test-data";
import { getTournamentSettings } from "@/lib/tournament-settings";

const VALID_ROLES = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill", "Sub"] as const;
export type PlayerRole = (typeof VALID_ROLES)[number];

export function isPlayerRole(value: string): value is PlayerRole {
	return (VALID_ROLES as readonly string[]).includes(value);
}

export type BotStoredPlayer = {
	riotId: string;
	puuid: string;
	discordId?: string;
	discordUsername?: string;
	displayName?: string;
	role?: PlayerRole;
	verificationStatus?: "verified" | "manual";
};

export type BotTeamMeta = {
	group?: string;
	seed?: number;
	accent?: string;
	captain?: {
		discordId: string;
		discordUsername?: string;
		riotId: string;
		puuid: string;
		assignedAt: string;
	};
};

export type BotTeam = {
	name: string;
	players: BotStoredPlayer[];
	playedChampions: string[];
	roleId?: string;
	voiceChannelId?: string;
	textChannelId?: string;
	meta?: BotTeamMeta;
};

export type BotStateDoc = {
	_id: string;
	teams?: Record<string, BotTeam>;
	rosterPublishedAt?: string;
};

type RosterDraftTeam = {
	players?: BotStoredPlayer[];
	captain?: BotTeamMeta["captain"] | null;
	group?: string | null;
	seed?: number | null;
};

type RosterDraftDoc = {
	_id: "default";
	teams: Record<string, RosterDraftTeam>;
	updatedAt: string;
};

const ROSTER_DRAFT_COLLECTION = "tournament_roster_drafts";

export type RosterApplicant = {
	discordId: string;
	discordHandle: string;
	discordUsername?: string;
	displayName: string;
	riotId: string;
	puuid: string;
	currentRank: string | null;
	manualRankOverride: string | null;
	mainRole?: string;
	preferredRoles: string[];
	preferenceGroupCode?: string;
	availableAllDates: boolean;
	notes: string;
	acceptedRules: boolean;
	acceptedDataStorage: boolean;
	createdAt: string;
	updatedAt: string;
	verified: boolean;
	source: "application" | "manual";
};

export type RosterTeam = {
	/** lowercased team-name key (Mongo map key in bot_state.teams) */
	key: string;
	name: string;
	group?: string;
	seed?: number;
	/** Captain discordId, if assigned via /setteammeta. */
	captainDiscordId: string | null;
	players: Array<{
		discordId: string;
		riotId: string;
		role: PlayerRole | null;
	}>;
};

export type RosterSnapshot = {
	applicants: RosterApplicant[];
	teams: RosterTeam[];
	testModeActive: boolean;
	publication: {
		publishedAt: string | null;
		draftUpdatedAt: string | null;
		hasUnpublishedChanges: boolean;
	};
};

export async function getRosterPublicationStatus(): Promise<{
	published: boolean;
	publishedAt: string | null;
	teamCount: number;
	playerCount: number;
}> {
	const db = await getDb();
	const doc = await db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" });
	const teams = Object.values(doc?.teams ?? {});
	const playerCount = teams.reduce((total, team) => total + (team.players?.length ?? 0), 0);
	return {
		published: Boolean(doc?.rosterPublishedAt && teams.length > 0 && playerCount > 0),
		publishedAt: doc?.rosterPublishedAt ?? null,
		teamCount: teams.length,
		playerCount,
	};
}

/** Single read fetching everything the roster builder needs. */
export async function loadRosterSnapshot(): Promise<RosterSnapshot> {
	const db = await getDb();
	const [appsRaw, botDoc, draftDoc, preferenceGroups, testModeActive] = await Promise.all([
		listApplications(),
		db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" }),
		db.collection<RosterDraftDoc>(ROSTER_DRAFT_COLLECTION).findOne({ _id: "default" }),
		listPreferenceGroups(),
		isTestRosterModeActive(),
	]);

	const visibleApplications = testModeActive ? appsRaw.filter((application) => application.discordId.startsWith("test-")) : appsRaw;
	const publishedTeamsObj = botDoc?.teams ?? {};
	const teamsObj = testModeActive ? publishedTeamsObj : applyDraftToTeams(publishedTeamsObj, draftDoc);
	const teams: RosterTeam[] = Object.entries(teamsObj).map(([key, t]) => ({
		key,
		name: t.name,
		group: t.meta?.group,
		seed: t.meta?.seed,
		captainDiscordId: t.meta?.captain?.discordId ?? null,
		players: t.players.map((p) => ({
			discordId: p.discordId ?? "",
			riotId: p.riotId,
			role: p.role ?? null,
		})),
	}));

	const preferenceGroupByDiscordId = new Map(preferenceGroups.flatMap((group) => group.memberDiscordIds.map((discordId) => [discordId, group.code] as const)));
	const applicants: RosterApplicant[] = visibleApplications.map((application) => toApplicant(application, preferenceGroupByDiscordId.get(application.discordId)));
	const applicantIds = new Set(applicants.map((applicant) => applicant.discordId));

	for (const team of Object.values(teamsObj)) {
		for (const player of team.players ?? []) {
			if (!player.discordId || player.verificationStatus !== "manual" || applicantIds.has(player.discordId)) {
				continue;
			}
			applicants.push(toManualApplicant(player));
			applicantIds.add(player.discordId);
		}
	}

	return {
		applicants,
		teams,
		testModeActive,
		publication: {
			publishedAt: botDoc?.rosterPublishedAt ?? null,
			draftUpdatedAt: draftDoc?.updatedAt ?? null,
			hasUnpublishedChanges: Boolean(!testModeActive && draftDoc && rosterSignature(publishedTeamsObj) !== rosterSignature(teamsObj)),
		},
	};
}

function applyDraftToTeams(publishedTeams: Record<string, BotTeam>, draft: RosterDraftDoc | null): Record<string, BotTeam> {
	if (!draft) return publishedTeams;
	return Object.fromEntries(
		Object.entries(publishedTeams).map(([teamKey, team]) => {
			const draftTeam = draft.teams[teamKey];
			if (!draftTeam) return [teamKey, team];
			const nextMeta: BotTeamMeta = { ...(team.meta ?? {}) };
			if ("captain" in draftTeam) {
				if (draftTeam.captain) nextMeta.captain = draftTeam.captain;
				else delete nextMeta.captain;
			}
			if ("group" in draftTeam || "seed" in draftTeam) {
				if (draftTeam.group && draftTeam.seed) {
					nextMeta.group = draftTeam.group;
					nextMeta.seed = draftTeam.seed;
				} else {
					delete nextMeta.group;
					delete nextMeta.seed;
				}
			}
			return [
				teamKey,
				{
					...team,
					players: draftTeam.players ?? team.players,
					meta: nextMeta,
				},
			];
		})
	);
}

function rosterSignature(teams: Record<string, BotTeam>): string {
	return JSON.stringify(
		Object.entries(teams)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([teamKey, team]) => ({
				teamKey,
				captainDiscordId: team.meta?.captain?.discordId ?? null,
				group: team.meta?.group ?? null,
				seed: team.meta?.seed ?? null,
				players: (team.players ?? [])
					.map((player) => ({ discordId: player.discordId ?? "", riotId: player.riotId, role: player.role ?? null }))
					.sort((left, right) => left.discordId.localeCompare(right.discordId)),
			}))
	);
}

function toApplicant(app: TournamentApplication, preferenceGroupCode?: string): RosterApplicant {
	return {
		discordId: app.discordId,
		discordHandle: app.discordHandle,
		discordUsername: app.discordUsername,
		displayName: app.displayName,
		riotId: app.riotId,
		puuid: app.riotPuuid,
		currentRank: app.currentRankAuto,
		manualRankOverride: app.manualRankOverride ?? null,
		mainRole: app.mainRole,
		preferredRoles: app.preferredRoles,
		preferenceGroupCode,
		availableAllDates: app.availableAllDates,
		notes: app.notes,
		acceptedRules: app.acceptedRules,
		acceptedDataStorage: app.acceptedDataStorage,
		createdAt: app.createdAt,
		updatedAt: app.updatedAt,
		verified: true,
		source: "application",
	};
}

function toManualApplicant(player: BotStoredPlayer): RosterApplicant {
	const now = new Date().toISOString();
	const discordUsername = player.discordUsername?.replace(/^@+/, "").trim();
	const displayName = player.displayName?.trim() || discordUsername || player.riotId.split("#")[0] || "Manueller Spieler";
	const assignedRole = player.role ?? "Sub";
	return {
		discordId: player.discordId ?? "",
		discordHandle: discordUsername ? `@${discordUsername}` : (player.discordId ?? ""),
		discordUsername,
		displayName,
		riotId: player.riotId,
		puuid: player.puuid,
		currentRank: null,
		manualRankOverride: null,
		mainRole: assignedRole,
		preferredRoles: [assignedRole],
		availableAllDates: false,
		notes: "Manuell durch die Turnierleitung ohne Website-Bewerbung eingetragen.",
		acceptedRules: false,
		acceptedDataStorage: false,
		createdAt: now,
		updatedAt: now,
		verified: false,
		source: "manual",
	};
}

export type RosterAssignment = {
	/** Lowercased team-name key. Empty string = unassigned. */
	teamKey: string;
	discordId: string;
	role: PlayerRole | null;
};

export type RosterSavePayload = {
	/** Full target state — server replaces each team's player list with this. */
	teamPlayers: Record<string, Array<{ discordId: string; role: PlayerRole | null }>>;
	/** Optional captain change per team (discordId or null to clear). */
	captains?: Record<string, string | null>;
	/** Players entered by an admin without a completed website application. */
	manualPlayers?: Record<
		string,
		{
			discordUsername: string;
			displayName: string;
			riotId: string;
		}
	>;
};

/**
 * Saves a private roster draft. This never changes the public roster or
 * queues Discord operations. Test mode remains isolated and writes its dummy
 * roster directly so tournament simulations continue to work.
 * 1. Every team key references an existing team
 * 2. Every discordId has a verified Riot account or an explicit manual substitute record
 * 3. No discordId appears on more than one team
 * Returns a summary of changes for the response.
 */
export async function applyRoster(payload: RosterSavePayload): Promise<{
	applied: number;
	teamsUpdated: number;
	errors: string[];
	warnings: string[];
}> {
	const db = await getDb();
	const [doc, testModeActive, existingDraft] = await Promise.all([
		db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" }),
		isTestRosterModeActive(),
		db.collection<RosterDraftDoc>(ROSTER_DRAFT_COLLECTION).findOne({ _id: "default" }),
	]);
	const teamsObj = doc?.teams ?? {};
	const errors: string[] = [];
	const seen = new Map<string, string>(); // discordId → teamKey

	for (const [teamKey, slots] of Object.entries(payload.teamPlayers)) {
		if (!teamsObj[teamKey]) {
			errors.push(`Unknown team: ${teamKey}`);
			continue;
		}
		for (const slot of slots) {
			if (seen.has(slot.discordId)) {
				errors.push(`Discord user ${slot.discordId} assigned to ${teamKey} but already on ${seen.get(slot.discordId)}`);
			} else {
				seen.set(slot.discordId, teamKey);
			}
		}
	}

	if (errors.length > 0) {
		return { applied: 0, teamsUpdated: 0, errors, warnings: [] };
	}

	// Resolve all referenced discordIds to verified Riot accounts or explicitly
	// admin-entered emergency substitutes.
	const allDiscordIds = [...new Set(Array.from(seen.keys()))];
	const verifiedDocs = await db
		.collection<{ _id: string; riotId: string; puuid: string; discordId: string }>("verified_riot_accounts")
		.find({ _id: { $in: allDiscordIds } })
		.toArray();
	const verifiedByDiscordId = new Map(verifiedDocs.map((v) => [v.discordId, v]));
	const manualByDiscordId = new Map(
		Object.entries(payload.manualPlayers ?? {}).map(([discordId, player]) => [
			discordId,
			{
				discordId,
				discordUsername: player.discordUsername.replace(/^@+/, "").trim(),
				displayName: player.displayName.trim(),
				riotId: player.riotId.trim(),
				puuid: `manual-${discordId}`,
			},
		])
	);

	for (const discordId of allDiscordIds) {
		if (!verifiedByDiscordId.has(discordId) && !manualByDiscordId.has(discordId)) {
			errors.push(`Discord-Nutzer ${discordId} hat keinen verifizierten oder manuellen Riot-Account.`);
		}
	}
	if (errors.length > 0) {
		return { applied: 0, teamsUpdated: 0, errors, warnings: [] };
	}

	let applied = 0;
	let teamsUpdated = 0;
	const setOps: Record<string, unknown> = {};

	for (const [teamKey, slots] of Object.entries(payload.teamPlayers)) {
		const players: BotStoredPlayer[] = slots.map((slot) => {
			const verified = verifiedByDiscordId.get(slot.discordId);
			const manual = manualByDiscordId.get(slot.discordId);
			const account = verified ?? manual!;
			return {
				riotId: account.riotId,
				puuid: account.puuid,
				discordId: account.discordId,
				...(manual && !verified
					? {
							discordUsername: manual.discordUsername,
							displayName: manual.displayName,
							verificationStatus: "manual" as const,
						}
					: { verificationStatus: "verified" as const }),
				...(slot.role ? { role: slot.role } : {}),
			};
		});
		setOps[`teams.${teamKey}.players`] = players;
		applied += players.length;
		teamsUpdated += 1;
	}

	if (payload.captains) {
		for (const [teamKey, captainId] of Object.entries(payload.captains)) {
			if (!teamsObj[teamKey]) continue;
			if (captainId === null) {
				// Unset captain — handled below via $unset
				continue;
			}
			const v = verifiedByDiscordId.get(captainId);
			if (!v) {
				errors.push(`Captain ${captainId} benötigt einen verifizierten Riot-Account.`);
				continue;
			}
			setOps[`teams.${teamKey}.meta.captain`] = {
				discordId: v.discordId,
				riotId: v.riotId,
				puuid: v.puuid,
				assignedAt: new Date().toISOString(),
			};
		}
	}
	if (errors.length > 0) {
		return { applied: 0, teamsUpdated: 0, errors, warnings: [] };
	}

	const unsetOps: Record<string, ""> = {};
	if (payload.captains) {
		for (const [teamKey, captainId] of Object.entries(payload.captains)) {
			if (captainId === null) {
				unsetOps[`teams.${teamKey}.meta.captain`] = "";
			}
		}
	}

	const update: Record<string, unknown> = {};
	if (Object.keys(setOps).length > 0) update.$set = setOps;
	if (Object.keys(unsetOps).length > 0) update.$unset = unsetOps;

	if (Object.keys(update).length > 0) {
		if (testModeActive) {
			await db.collection<BotStateDoc>("bot_state").updateOne({ _id: "default" }, update, { upsert: true });
		} else {
			const draftTeams: Record<string, RosterDraftTeam> = {};
			for (const teamKey of Object.keys(payload.teamPlayers)) {
				const captain = setOps[`teams.${teamKey}.meta.captain`] as BotTeamMeta["captain"] | undefined;
				draftTeams[teamKey] = {
					...(existingDraft?.teams[teamKey] ?? {}),
					players: (setOps[`teams.${teamKey}.players`] as BotStoredPlayer[] | undefined) ?? [],
					...(payload.captains ? { captain: captain ?? null } : {}),
				};
			}
			await db
				.collection<RosterDraftDoc>(ROSTER_DRAFT_COLLECTION)
				.updateOne({ _id: "default" }, { $set: { teams: draftTeams, updatedAt: new Date().toISOString() } }, { upsert: true });
		}
	}
	if (!testModeActive) {
		return {
			applied,
			teamsUpdated,
			errors: [],
			warnings: [],
		};
	}
	if (testModeActive) {
		return {
			applied,
			teamsUpdated,
			errors: [],
			warnings: ["Testmodus aktiv: Das Roster wurde nur in MongoDB gespeichert; Discord-Rollen wurden nicht synchronisiert."],
		};
	}
	return { applied, teamsUpdated, errors: [], warnings: [] };
}

type PublishedPlacement = {
	teamKey: string;
	teamName: string;
	role: PlayerRole | null;
	isCaptain: boolean;
};

export async function publishRoster(options: { repairDiscordRoles?: boolean } = {}): Promise<{
	published: boolean;
	publishedAt: string | null;
	players: number;
	changedPlacements: number;
	dmQueued: number;
	dmOptedOut: number;
	warnings: string[];
	discordJobId?: string;
}> {
	const db = await getDb();
	const [botDoc, draftDoc, testModeActive, applications, settings] = await Promise.all([
		db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" }),
		db.collection<RosterDraftDoc>(ROSTER_DRAFT_COLLECTION).findOne({ _id: "default" }),
		isTestRosterModeActive(),
		listApplications(),
		getTournamentSettings(),
	]);
	if (testModeActive) throw new Error("Das Test-Roster kann nicht veröffentlicht werden.");

	const previousTeams = botDoc?.teams ?? {};
	const nextTeams = applyDraftToTeams(previousTeams, draftDoc);
	if (!options.repairDiscordRoles) {
		const config = settings.ultimateBravery;
		const teams = Object.values(nextTeams);
		if (teams.length !== config.teamCount) {
			throw new Error(`Zum Veröffentlichen werden genau ${config.teamCount} Teams benötigt; aktuell sind ${teams.length} angelegt.`);
		}
		const incompleteTeams = teams
			.map((team) => {
				const activePlayers = (team.players ?? []).filter((player) => player.role !== "Sub").length;
				const substitutes = (team.players ?? []).filter((player) => player.role === "Sub").length;
				return { team, activePlayers, substitutes };
			})
			.filter(({ activePlayers }) => activePlayers !== config.playersPerTeam);
		if (incompleteTeams.length > 0) {
			throw new Error(
				`Jedes Team benötigt genau ${config.playersPerTeam} aktive Spieler; zusätzliche Subs sind erlaubt. Bitte prüfen: ${incompleteTeams
					.map(({ team, activePlayers, substitutes }) => `${team.name} (${activePlayers} aktiv, ${substitutes} ${substitutes === 1 ? "Sub" : "Subs"})`)
					.join(", ")}.`
			);
		}
		if (config.dayOneFormat === "groups") {
			const groups = Array.from({ length: config.groupCount }, (_, index) => String.fromCharCode(65 + index));
			const seenSlots = new Set<string>();
			for (const team of teams) {
				const group = team.meta?.group;
				const seed = team.meta?.seed;
				const slot = group && seed ? `${group}-${seed}` : null;
				if (!group || !groups.includes(group) || !Number.isInteger(seed) || !slot || seenSlots.has(slot)) {
					throw new Error("Vor der Veröffentlichung müssen alle Teams im Gruppenplan genau einem freien Gruppen-Seed zugeordnet sein.");
				}
				seenSlots.add(slot);
			}
		}
	}
	const changed = rosterSignature(previousTeams) !== rosterSignature(nextTeams);
	const firstPublication = !options.repairDiscordRoles && !botDoc?.rosterPublishedAt;
	const shouldPublish = changed || firstPublication;
	if (!shouldPublish && !options.repairDiscordRoles) {
		return {
			published: false,
			publishedAt: botDoc?.rosterPublishedAt ?? null,
			players: countRosterPlayers(nextTeams),
			changedPlacements: 0,
			dmQueued: 0,
			dmOptedOut: 0,
			warnings: [],
		};
	}

	const publicationBaseline = firstPublication
		? Object.fromEntries(
				Object.entries(previousTeams).map(([teamKey, team]) => [
					teamKey,
					{
						...team,
						players: [],
						meta: team.meta ? { ...team.meta, captain: undefined } : undefined,
					},
				])
			)
		: previousTeams;
	const previousPlayerIds = rosterPlayerIds(publicationBaseline);
	const nextPlayerIds = rosterPlayerIds(nextTeams);
	const previousCaptainIds = rosterCaptainIds(publicationBaseline);
	const nextCaptains = Object.fromEntries(Object.entries(nextTeams).map(([teamKey, team]) => [teamKey, team.meta?.captain?.discordId ?? null]));
	const teamPlayers = Object.fromEntries(
		Object.entries(nextTeams).map(([teamKey, team]) => [
			teamKey,
			(team.players ?? [])
				.filter((player): player is BotStoredPlayer & { discordId: string } => Boolean(player.discordId))
				.map((player) => ({ discordId: player.discordId, role: player.role ?? null })),
		])
	);

	const warnings: string[] = [];
	const operations: DiscordOperation[] = [];
	const tournamentRolePlan = planDiscordTournamentRole(previousPlayerIds, nextPlayerIds, Boolean(options.repairDiscordRoles));
	warnings.push(...tournamentRolePlan.warnings);
	operations.push(...tournamentRolePlan.operations);
	const teamRolePlan = planDiscordTeamRoles(publicationBaseline, teamPlayers, Boolean(options.repairDiscordRoles));
	warnings.push(...teamRolePlan.warnings);
	operations.push(...teamRolePlan.operations);
	const captainRolePlan = planDiscordCaptainRole(previousCaptainIds, nextCaptains, Boolean(options.repairDiscordRoles));
	warnings.push(...captainRolePlan.warnings);
	operations.push(...captainRolePlan.operations);

	const previousPlacements = rosterPlacements(publicationBaseline);
	const nextPlacements = rosterPlacements(nextTeams);
	const appByDiscordId = new Map(applications.map((application) => [application.discordId, application]));
	let changedPlacements = 0;
	let dmQueued = 0;
	let dmOptedOut = 0;
	if (shouldPublish) {
		for (const discordId of new Set([...previousPlacements.keys(), ...nextPlacements.keys()])) {
			const previous = previousPlacements.get(discordId) ?? null;
			const next = nextPlacements.get(discordId) ?? null;
			if (JSON.stringify(previous) === JSON.stringify(next)) continue;
			changedPlacements += 1;
			const application = appByDiscordId.get(discordId);
			if (!application || application.discordDmOptIn === false) {
				if (application) dmOptedOut += 1;
				continue;
			}
			operations.push({
				kind: "direct-message",
				discordId,
				payload: rosterPublicationMessage(next),
				dedupeKey: `roster-publication:${discordId}`,
				label: `${application.displayName}: Teamveröffentlichung senden`,
			});
			dmQueued += 1;
		}
	}

	const publishedAt = new Date().toISOString();
	if (shouldPublish) {
		const setOps: Record<string, unknown> = { rosterPublishedAt: publishedAt };
		const unsetOps: Record<string, ""> = {};
		for (const [teamKey, team] of Object.entries(nextTeams)) {
			setOps[`teams.${teamKey}.players`] = team.players ?? [];
			if (team.meta?.captain) setOps[`teams.${teamKey}.meta.captain`] = team.meta.captain;
			else unsetOps[`teams.${teamKey}.meta.captain`] = "";
			if (team.meta?.group && team.meta.seed) {
				setOps[`teams.${teamKey}.meta.group`] = team.meta.group;
				setOps[`teams.${teamKey}.meta.seed`] = team.meta.seed;
			} else {
				unsetOps[`teams.${teamKey}.meta.group`] = "";
				unsetOps[`teams.${teamKey}.meta.seed`] = "";
			}
		}
		await db
			.collection<BotStateDoc>("bot_state")
			.updateOne({ _id: "default" }, { $set: setOps, ...(Object.keys(unsetOps).length ? { $unset: unsetOps } : {}) }, { upsert: true });
		await db.collection<RosterDraftDoc>(ROSTER_DRAFT_COLLECTION).deleteOne({ _id: "default" });
	}

	const discordJob = await enqueueDiscordJob({
		type: options.repairDiscordRoles ? "roster-role-repair" : "roster-publish",
		title: options.repairDiscordRoles ? "Veröffentlichte Discord-Rollen reparieren" : "Roster veröffentlichen",
		operations,
	});

	return {
		published: shouldPublish,
		publishedAt: shouldPublish ? publishedAt : (botDoc?.rosterPublishedAt ?? null),
		players: countRosterPlayers(nextTeams),
		changedPlacements,
		dmQueued,
		dmOptedOut,
		warnings,
		discordJobId: discordJob?.id,
	};
}

function rosterPlayerIds(teams: Record<string, BotTeam>): Set<string> {
	return new Set(
		Object.values(teams)
			.flatMap((team) => team.players ?? [])
			.map((player) => player.discordId)
			.filter((discordId): discordId is string => Boolean(discordId))
	);
}

function rosterCaptainIds(teams: Record<string, BotTeam>): Set<string> {
	return new Set(
		Object.values(teams)
			.map((team) => team.meta?.captain?.discordId)
			.filter((discordId): discordId is string => Boolean(discordId))
	);
}

function countRosterPlayers(teams: Record<string, BotTeam>): number {
	return Object.values(teams).reduce((total, team) => total + (team.players?.length ?? 0), 0);
}

function rosterPlacements(teams: Record<string, BotTeam>): Map<string, PublishedPlacement> {
	const placements = new Map<string, PublishedPlacement>();
	for (const [teamKey, team] of Object.entries(teams)) {
		for (const player of team.players ?? []) {
			if (!player.discordId) continue;
			placements.set(player.discordId, {
				teamKey,
				teamName: team.name,
				role: player.role ?? null,
				isCaptain: team.meta?.captain?.discordId === player.discordId,
			});
		}
	}
	return placements;
}

function rosterPublicationMessage(placement: PublishedPlacement | null): DiscordDirectMessagePayload {
	const tournamentBaseUrl = "https://tournament.lauchgruen.de";
	const commonButtons = [
		{
			type: 2 as const,
			style: 5 as const,
			label: "Mein Turnierkonto",
			url: `${tournamentBaseUrl}/me`,
		},
	];

	if (!placement) {
		return {
			content: "🐻 **Post von Lauchgruen**",
			embeds: [
				{
					author: { name: "LAUCHGRUEN · TURNIERPOST" },
					title: "Deine Teamzuteilung wurde geändert",
					description:
						"Du bist aktuell keinem veröffentlichten Team zugeteilt. Das kann durch eine kurzfristige Rosteränderung passieren. Wenn dir dazu noch keine Information vorliegt, melde dich bitte bei der Turnierleitung.",
					color: 0xe7b955,
					fields: [{ name: "DEIN STATUS", value: "Momentan ohne veröffentlichtes Team", inline: false }],
					footer: { text: "Lauchgruen Community-Turniere · Wir halten dich auf dem Laufenden" },
					timestamp: new Date().toISOString(),
				},
			],
			components: [{ type: 1, components: commonButtons }],
		};
	}

	const roleLabels: Partial<Record<PlayerRole, string>> = {
		Top: "Toplane",
		Jungle: "Jungle",
		Mid: "Midlane",
		Bot: "Botlane",
		Support: "Support",
		Fill: "Flexibel",
		Sub: "Ersatzspieler:in",
	};
	const role = placement.role ? (roleLabels[placement.role] ?? placement.role) : "Noch offen";
	const buttons = [
		...(placement.isCaptain
			? [
					{
						type: 2 as const,
						style: 5 as const,
						label: "Captain-Portal",
						url: `${tournamentBaseUrl}/captain`,
					},
				]
			: []),
		{
			type: 2 as const,
			style: 5 as const,
			label: "Teamübersicht",
			url: `${tournamentBaseUrl}/teams`,
		},
		...commonButtons,
	];

	return {
		content: "🐻 **Post von Lauchgruen**",
		embeds: [
			{
				author: { name: "LAUCHGRUEN · TURNIERPOST" },
				title: placement.isCaptain ? `Du führst ${placement.teamName} an!` : `Willkommen bei ${placement.teamName}!`,
				description: placement.isCaptain
					? "Die Teams sind veröffentlicht und du wurdest als Captain ausgewählt. Stimme dich mit deinem Team ab und bereite eure Matches im Captain-Portal vor. 💚"
					: "Die Teams sind veröffentlicht und dein Platz steht fest. Lernt euch kennen, stimmt euch für das Turnier ab und habt vor allem eine gute Zeit miteinander. 💚",
				color: 0xb7f36b,
				fields: [
					{ name: "DEIN TEAM", value: `**${placement.teamName}**`, inline: true },
					{ name: "DEINE ROLLE", value: `**${role}**`, inline: true },
					{
						name: "DEIN STATUS",
						value: placement.isCaptain ? "👑 Team-Captain" : "✓ Teammitglied",
						inline: true,
					},
				],
				footer: { text: "Lauchgruen Community-Turniere · Fair spielen, gemeinsam Spaß haben" },
				timestamp: new Date().toISOString(),
			},
		],
		components: [{ type: 1, components: buttons }],
	};
}

function planDiscordTournamentRole(previousPlayerIds: Set<string>, nextPlayerIds: Set<string>, repairExisting: boolean): { operations: DiscordOperation[]; warnings: string[] } {
	const roleId = process.env.DISCORD_TOURNAMENT_ROLE_ID?.trim();
	if (!roleId) {
		return { operations: [], warnings: ["Turnierrolle nicht synchronisiert: DISCORD_TOURNAMENT_ROLE_ID fehlt."] };
	}

	const warnings: string[] = [];
	const operations: DiscordOperation[] = [];

	for (const discordId of nextPlayerIds) {
		if (!repairExisting && previousPlayerIds.has(discordId)) continue;
		operations.push({
			kind: "role",
			discordId,
			roleId,
			enabled: true,
			label: `${discordId}: Turnierrolle vergeben`,
		});
	}

	// The tournament role is persistent: former players retain access to
	// feedback and archive channels after their team role is removed.

	return { operations, warnings };
}

function planDiscordTeamRoles(
	teams: Record<string, BotTeam>,
	teamPlayers: RosterSavePayload["teamPlayers"],
	repairExisting: boolean
): { operations: DiscordOperation[]; warnings: string[] } {
	const warnings: string[] = [];
	const operations: DiscordOperation[] = [];

	for (const [teamKey, nextSlots] of Object.entries(teamPlayers)) {
		const team = teams[teamKey];
		if (!team) continue;

		const previousIds = new Set((team.players ?? []).map((player) => player.discordId).filter((discordId): discordId is string => !!discordId));
		const nextIds = new Set(nextSlots.map((slot) => slot.discordId));
		const roleId = team.roleId?.trim();

		if (!roleId) {
			if (nextIds.size > 0) {
				warnings.push(`Team-Rolle für „${team.name}“ fehlt. Erstelle oder verknüpfe zuerst eine Discord-Rolle für dieses Team.`);
			}
			continue;
		}

		for (const discordId of nextIds) {
			if (!repairExisting && previousIds.has(discordId)) continue;
			operations.push({
				kind: "role",
				discordId,
				roleId,
				enabled: true,
				label: `${discordId}: Team-Rolle ${team.name} vergeben`,
			});
		}

		for (const discordId of previousIds) {
			if (nextIds.has(discordId)) continue;
			operations.push({
				kind: "role",
				discordId,
				roleId,
				enabled: false,
				label: `${discordId}: Team-Rolle ${team.name} entfernen`,
			});
		}
	}

	return { operations, warnings };
}

function planDiscordCaptainRole(
	previousCaptainIds: Set<string>,
	captains: Record<string, string | null>,
	repairExisting: boolean
): { operations: DiscordOperation[]; warnings: string[] } {
	const roleId = process.env.DISCORD_CAPTAINS_ROLE_ID?.trim() || process.env.CAPTAIN_ROLE_ID?.trim();
	if (!roleId) {
		return { operations: [], warnings: ["Captain-Rolle nicht synchronisiert: DISCORD_CAPTAINS_ROLE_ID fehlt."] };
	}

	const nextCaptainIds = new Set(Object.values(captains).filter((discordId): discordId is string => !!discordId));
	const warnings: string[] = [];
	const operations: DiscordOperation[] = [];

	for (const discordId of nextCaptainIds) {
		if (!repairExisting && previousCaptainIds.has(discordId)) continue;
		operations.push({ kind: "role", discordId, roleId, enabled: true, label: `${discordId}: Captain-Rolle vergeben` });
	}

	for (const discordId of previousCaptainIds) {
		if (nextCaptainIds.has(discordId)) continue;
		operations.push({ kind: "role", discordId, roleId, enabled: false, label: `${discordId}: Captain-Rolle entfernen` });
	}

	return { operations, warnings };
}
