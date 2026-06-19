/**
 * Server-side helpers for the admin roster builder.
 *
 * The roster builder lets owners view all applicants alongside the bot's
 * existing teams and re-assign players + roles in one atomic save. It writes
 * back to `bot_state.teams` so the Discord bot keeps working unchanged.
 */

import { getDb } from "@/lib/mongo";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
import { listApplications, listPreferenceGroups, type TournamentApplication } from "@/lib/tournament-storage";

const VALID_ROLES = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill", "Sub"] as const;
export type PlayerRole = (typeof VALID_ROLES)[number];

export function isPlayerRole(value: string): value is PlayerRole {
	return (VALID_ROLES as readonly string[]).includes(value);
}

type BotStoredPlayer = {
	riotId: string;
	puuid: string;
	discordId?: string;
	discordUsername?: string;
	role?: PlayerRole;
	verificationStatus?: "verified" | "manual";
};

type BotTeamMeta = {
	group?: "A" | "B";
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

type BotTeam = {
	name: string;
	players: BotStoredPlayer[];
	playedChampions: string[];
	roleId?: string;
	voiceChannelId?: string;
	textChannelId?: string;
	meta?: BotTeamMeta;
};

type BotStateDoc = {
	_id: string;
	teams?: Record<string, BotTeam>;
};

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
	group?: "A" | "B";
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
};

/** Single read fetching everything the roster builder needs. */
export async function loadRosterSnapshot(): Promise<RosterSnapshot> {
	const db = await getDb();
	const [appsRaw, botDoc, preferenceGroups] = await Promise.all([
		listApplications(),
		db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" }),
		listPreferenceGroups(),
	]);

	const teamsObj = botDoc?.teams ?? {};
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
	const applicants: RosterApplicant[] = appsRaw.map((application) => toApplicant(application, preferenceGroupByDiscordId.get(application.discordId)));
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

	return { applicants, teams };
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
	return {
		discordId: player.discordId ?? "",
		discordHandle: discordUsername ? `@${discordUsername}` : (player.discordId ?? ""),
		discordUsername,
		displayName: discordUsername || player.riotId.split("#")[0] || "Ersatzspieler",
		riotId: player.riotId,
		puuid: player.puuid,
		currentRank: null,
		manualRankOverride: null,
		mainRole: "Sub",
		preferredRoles: ["Sub"],
		availableAllDates: false,
		notes: "Manuell durch die Turnierleitung als Ersatzspieler eingetragen.",
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
	/** Force role PUTs for current members to repair missing Discord roles. */
	repairDiscordRoles?: boolean;
	/** Emergency substitutes entered by an admin without account verification. */
	manualPlayers?: Record<
		string,
		{
			discordUsername: string;
			riotId: string;
		}
	>;
};

/**
 * Applies a roster snapshot to bot_state. Validates that:
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
	discordJobId?: string;
}> {
	const db = await getDb();
	const doc = await db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" });
	const teamsObj = doc?.teams ?? {};
	const previousCaptainIds = new Set(
		Object.values(teamsObj)
			.map((team) => team.meta?.captain?.discordId)
			.filter((discordId): discordId is string => !!discordId)
	);
	const previousPlayerIds = new Set(
		Object.values(teamsObj)
			.flatMap((team) => team.players ?? [])
			.map((player) => player.discordId)
			.filter((discordId): discordId is string => !!discordId)
	);

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

	// Pull applications once for role-default fallbacks.
	const apps = await listApplications();
	const appByDiscord = new Map(apps.map((a) => [a.discordId, a]));

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
							verificationStatus: "manual" as const,
						}
					: { verificationStatus: "verified" as const }),
				...(slot.role ? { role: slot.role } : {}),
			};
		});
		void appByDiscord;
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
		await db.collection<BotStateDoc>("bot_state").updateOne({ _id: "default" }, update, { upsert: true });
	}

	const repairDiscordRoles = Boolean(payload.repairDiscordRoles);
	const warnings: string[] = [];
	const operations: DiscordOperation[] = [];
	const tournamentRolePlan = planDiscordTournamentRole(previousPlayerIds, new Set(allDiscordIds), repairDiscordRoles);
	warnings.push(...tournamentRolePlan.warnings);
	operations.push(...tournamentRolePlan.operations);
	const teamRolePlan = planDiscordTeamRoles(teamsObj, payload.teamPlayers, repairDiscordRoles);
	warnings.push(...teamRolePlan.warnings);
	operations.push(...teamRolePlan.operations);
	if (payload.captains) {
		const captainRolePlan = planDiscordCaptainRole(previousCaptainIds, payload.captains, repairDiscordRoles);
		warnings.push(...captainRolePlan.warnings);
		operations.push(...captainRolePlan.operations);
	}

	const discordJob = await enqueueDiscordJob({
		type: repairDiscordRoles ? "roster-role-repair" : "roster-role-sync",
		title: repairDiscordRoles ? "Discord-Rollen reparieren" : "Discord-Rollen synchronisieren",
		operations,
	});

	return { applied, teamsUpdated, errors: [], warnings, discordJobId: discordJob?.id };
}

function planDiscordTournamentRole(
	previousPlayerIds: Set<string>,
	nextPlayerIds: Set<string>,
	repairExisting: boolean
): { operations: DiscordOperation[]; warnings: string[] } {
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

	for (const discordId of previousPlayerIds) {
		if (nextPlayerIds.has(discordId)) continue;
		operations.push({
			kind: "role",
			discordId,
			roleId,
			enabled: false,
			label: `${discordId}: Turnierrolle entfernen`,
		});
	}

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
