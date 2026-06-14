/**
 * Server-side helpers for the admin roster builder.
 *
 * The roster builder lets owners view all applicants alongside the bot's
 * existing teams and re-assign players + roles in one atomic save. It writes
 * back to `bot_state.teams` so the Discord bot keeps working unchanged.
 */

import { getDb } from "@/lib/mongo";
import { setDiscordMemberRole } from "@/lib/discord";
import {
  listApplications,
  listPreferenceGroups,
  type TournamentApplication,
} from "@/lib/tournament-storage";

const VALID_ROLES = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill", "Sub"] as const;
export type PlayerRole = (typeof VALID_ROLES)[number];

export function isPlayerRole(value: string): value is PlayerRole {
  return (VALID_ROLES as readonly string[]).includes(value);
}

type BotStoredPlayer = {
  riotId: string;
  puuid: string;
  discordId?: string;
  role?: PlayerRole;
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
  mainRole?: string;
  preferredRoles: string[];
  preferenceGroupCode?: string;
  availableAllDates: boolean;
  notes: string;
  acceptedRules: boolean;
  acceptedDataStorage: boolean;
  createdAt: string;
  updatedAt: string;
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

  const preferenceGroupByDiscordId = new Map(
    preferenceGroups.flatMap((group) =>
      group.memberDiscordIds.map(
        (discordId) => [discordId, group.code] as const,
      ),
    ),
  );
  const applicants: RosterApplicant[] = appsRaw.map((application) =>
    toApplicant(
      application,
      preferenceGroupByDiscordId.get(application.discordId),
    ),
  );

  return { applicants, teams };
}

function toApplicant(
  app: TournamentApplication,
  preferenceGroupCode?: string,
): RosterApplicant {
  return {
    discordId: app.discordId,
    discordHandle: app.discordHandle,
    discordUsername: app.discordUsername,
    displayName: app.displayName,
    riotId: app.riotId,
    puuid: app.riotPuuid,
    currentRank: app.currentRankAuto,
    mainRole: app.mainRole,
    preferredRoles: app.preferredRoles,
    preferenceGroupCode,
    availableAllDates: app.availableAllDates,
    notes: app.notes,
    acceptedRules: app.acceptedRules,
    acceptedDataStorage: app.acceptedDataStorage,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
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
};

/**
 * Applies a roster snapshot to bot_state. Validates that:
 * 1. Every team key references an existing team
 * 2. Every discordId has a verified Riot account
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
  const doc = await db
    .collection<BotStateDoc>("bot_state")
    .findOne({ _id: "default" });
  const teamsObj = doc?.teams ?? {};
  const previousCaptainIds = new Set(
    Object.values(teamsObj)
      .map((team) => team.meta?.captain?.discordId)
      .filter((discordId): discordId is string => !!discordId),
  );
  const previousPlayerIds = new Set(
    Object.values(teamsObj)
      .flatMap((team) => team.players ?? [])
      .map((player) => player.discordId)
      .filter((discordId): discordId is string => !!discordId),
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
        errors.push(
          `Discord user ${slot.discordId} assigned to ${teamKey} but already on ${seen.get(slot.discordId)}`,
        );
      } else {
        seen.set(slot.discordId, teamKey);
      }
    }
  }

  if (errors.length > 0) {
    return { applied: 0, teamsUpdated: 0, errors, warnings: [] };
  }

  // Resolve all referenced discordIds → verified Riot accounts in one query.
  const allDiscordIds = [...new Set(Array.from(seen.keys()))];
  const verifiedDocs = await db
    .collection<{ _id: string; riotId: string; puuid: string; discordId: string }>(
      "verified_riot_accounts",
    )
    .find({ _id: { $in: allDiscordIds } })
    .toArray();
  const verifiedByDiscordId = new Map(verifiedDocs.map((v) => [v.discordId, v]));

  for (const discordId of allDiscordIds) {
    if (!verifiedByDiscordId.has(discordId)) {
      errors.push(`Discord user ${discordId} has not verified their Riot account`);
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
      const v = verifiedByDiscordId.get(slot.discordId)!;
      return {
        riotId: v.riotId,
        puuid: v.puuid,
        discordId: v.discordId,
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
        errors.push(`Captain ${captainId} has no verified Riot account`);
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
    await db
      .collection<BotStateDoc>("bot_state")
      .updateOne({ _id: "default" }, update, { upsert: true });
  }

  const warnings = await syncDiscordTournamentRole(
    previousPlayerIds,
    new Set(allDiscordIds),
  );
  warnings.push(...(await syncDiscordTeamRoles(teamsObj, payload.teamPlayers)));
  if (payload.captains) {
    warnings.push(
      ...(await syncDiscordCaptainRole(previousCaptainIds, payload.captains)),
    );
  }

  return { applied, teamsUpdated, errors: [], warnings };
}

async function syncDiscordTournamentRole(
  previousPlayerIds: Set<string>,
  nextPlayerIds: Set<string>,
): Promise<string[]> {
  const roleId = process.env.DISCORD_TOURNAMENT_ROLE_ID?.trim();
  if (!roleId) {
    return [
      "Turnierrolle nicht synchronisiert: DISCORD_TOURNAMENT_ROLE_ID fehlt.",
    ];
  }

  const warnings: string[] = [];

  // PUT is idempotent and repairs roles removed manually between roster saves.
  for (const discordId of nextPlayerIds) {
    const result = await setDiscordMemberRole({
      discordId,
      roleId,
      enabled: true,
    });
    if (!result.ok) warnings.push(result.message);
  }

  for (const discordId of previousPlayerIds) {
    if (nextPlayerIds.has(discordId)) continue;
    const result = await setDiscordMemberRole({
      discordId,
      roleId,
      enabled: false,
    });
    if (!result.ok) warnings.push(result.message);
  }

  return warnings;
}

async function syncDiscordTeamRoles(
  teams: Record<string, BotTeam>,
  teamPlayers: RosterSavePayload["teamPlayers"],
): Promise<string[]> {
  const warnings: string[] = [];

  for (const [teamKey, nextSlots] of Object.entries(teamPlayers)) {
    const team = teams[teamKey];
    if (!team) continue;

    const previousIds = new Set(
      (team.players ?? [])
        .map((player) => player.discordId)
        .filter((discordId): discordId is string => !!discordId),
    );
    const nextIds = new Set(nextSlots.map((slot) => slot.discordId));
    const roleId = team.roleId?.trim();

    if (!roleId) {
      if (nextIds.size > 0) {
        warnings.push(
          `Team-Rolle für „${team.name}“ fehlt. Erstelle oder verknüpfe zuerst eine Discord-Rolle für dieses Team.`,
        );
      }
      continue;
    }

    // Re-apply the role to every current player. Discord's PUT endpoint is
    // idempotent and therefore also repairs roles removed manually.
    for (const discordId of nextIds) {
      const result = await setDiscordMemberRole({
        discordId,
        roleId,
        enabled: true,
      });
      if (!result.ok) {
        warnings.push(`Team „${team.name}“: ${result.message}`);
      }
    }

    for (const discordId of previousIds) {
      if (nextIds.has(discordId)) continue;
      const result = await setDiscordMemberRole({
        discordId,
        roleId,
        enabled: false,
      });
      if (!result.ok) {
        warnings.push(`Team „${team.name}“: ${result.message}`);
      }
    }
  }

  return warnings;
}

async function syncDiscordCaptainRole(
  previousCaptainIds: Set<string>,
  captains: Record<string, string | null>,
): Promise<string[]> {
  const roleId =
    process.env.DISCORD_CAPTAINS_ROLE_ID?.trim()
    || process.env.CAPTAIN_ROLE_ID?.trim();
  if (!roleId) {
    return ["Captain-Rolle nicht synchronisiert: DISCORD_CAPTAINS_ROLE_ID fehlt."];
  }

  const nextCaptainIds = new Set(
    Object.values(captains).filter((discordId): discordId is string => !!discordId),
  );
  const warnings: string[] = [];

  for (const discordId of nextCaptainIds) {
    const result = await setDiscordMemberRole({ discordId, roleId, enabled: true });
    if (!result.ok) warnings.push(result.message);
  }

  for (const discordId of previousCaptainIds) {
    if (nextCaptainIds.has(discordId)) continue;
    const result = await setDiscordMemberRole({ discordId, roleId, enabled: false });
    if (!result.ok) warnings.push(result.message);
  }

  return warnings;
}
