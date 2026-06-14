import { playoffMatches, type GroupMatch } from "@/lib/tournament-data";
import { getDb } from "@/lib/mongo";
import { randomBytes } from "node:crypto";

export const TOURNAMENT_OWNER_DISCORD_IDS = new Set([
  "337568120028004362",
  "411520867978313730",
]);

export type TournamentApplication = {
  id: string;
  displayName: string;
  riotId: string;
  riotPuuid: string;
  riotVerifiedAt: string;
  currentRankAuto: string | null;
  discordId: string;
  discordHandle: string;
  discordUsername?: string;
  mainRole: string;
  preferredRoles: string[];
  availableAllDates: true;
  notes: string;
  acceptedRules: true;
  acceptedDataStorage: true;
  createdAt: string;
  updatedAt: string;
};

export type VerifiedRiotAccount = {
  discordId: string;
  riotId: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  currentRankAuto: string | null;
  verifiedAt: string;
};

export type RiotVerificationChallenge = {
  discordId: string;
  riotId: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  initialIconId: number;
  expectedIconId: number;
  createdAt: Date;
  expiresAt: Date;
};

export type TournamentBlacklistEntry = {
  id: string;
  discordId?: string;
  riotId?: string;
  reason: string;
  createdAt: string;
  createdBy?: string;
};

export const TOURNAMENT_PREFERENCE_GROUP_LIMIT = 5;

export type TournamentPreferenceGroup = {
  code: string;
  memberDiscordIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type StoredTournamentMatch = {
  id: string;
  scoreA?: number;
  scoreB?: number;
  gameDurationSeconds?: number;
  teamAChampions?: string[];
  teamBChampions?: string[];
  blueSide?: "teamA" | "teamB";
  status?: "Scheduled" | "Live" | "Finished" | "Locked" | "Pending";
  winner?: string;
  adminNote?: string;
  updatedAt?: string;
};

export type TournamentState = {
  applications: TournamentApplication[];
  matches: Record<string, StoredTournamentMatch>;
};

const APPLICATIONS = "tournament_applications";
const MATCHES = "tournament_matches";
const VERIFIED_RIOT = "verified_riot_accounts";
const RIOT_CHALLENGES = "riot_verifications";
const BLACKLIST = "tournament_blacklist";
const PREFERENCE_GROUPS = "tournament_preference_groups";

const VERIFICATION_TTL_MIN = 15;

let ensuredIndexes = false;
async function ensureIndexes() {
  if (ensuredIndexes) return;
  ensuredIndexes = true;
  const db = await getDb();
  await db
    .collection(RIOT_CHALLENGES)
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    .catch(() => {});
  await db
    .collection(PREFERENCE_GROUPS)
    .createIndex({ memberDiscordIds: 1 }, { unique: true })
    .catch(() => {});
}

function seededMatches(
  groupMatches: GroupMatch[],
): Record<string, StoredTournamentMatch> {
  return Object.fromEntries(
    [...groupMatches, ...playoffMatches].map((match) => [
      match.id,
      { id: match.id, status: match.status },
    ]),
  );
}

type AppDoc = TournamentApplication & { _id: string };
type MatchDoc = StoredTournamentMatch & { _id: string };
type BlacklistDoc = TournamentBlacklistEntry & { _id: string };
type PreferenceGroupDoc = Omit<TournamentPreferenceGroup, "code"> & {
  _id: string;
};

async function applicationsCollection() {
  return (await getDb()).collection<AppDoc>(APPLICATIONS);
}

async function matchesCollection() {
  return (await getDb()).collection<MatchDoc>(MATCHES);
}

async function blacklistCollection() {
  return (await getDb()).collection<BlacklistDoc>(BLACKLIST);
}

async function preferenceGroupsCollection() {
  await ensureIndexes();
  return (await getDb()).collection<PreferenceGroupDoc>(PREFERENCE_GROUPS);
}

function stripMongoId<T extends Record<string, unknown>>(doc: T): Omit<T, "_id"> {
  const { _id, ...rest } = doc;
  void _id;
  return rest;
}

export async function readTournamentState(
  groupMatches: GroupMatch[],
): Promise<TournamentState> {
  const [apps, matches] = await Promise.all([
    (await applicationsCollection())
      .find({}, { sort: { createdAt: 1 } })
      .toArray(),
    (await matchesCollection()).find({}).toArray(),
  ]);

  const matchesMap = seededMatches(groupMatches);
  for (const raw of matches) {
    const doc = stripMongoId(raw) as StoredTournamentMatch;
    matchesMap[doc.id] = { ...matchesMap[doc.id], ...doc };
  }

  return {
    applications: apps.map((raw) => stripMongoId(raw) as TournamentApplication),
    matches: matchesMap,
  };
}

export async function upsertApplication(app: TournamentApplication): Promise<void> {
  const col = await applicationsCollection();
  await col.replaceOne({ _id: app.id }, { ...app }, { upsert: true });
}

export async function findApplication(
  id: string,
): Promise<TournamentApplication | null> {
  const col = await applicationsCollection();
  const doc = await col.findOne({ _id: id });
  return doc ? (stripMongoId(doc) as TournamentApplication) : null;
}

export async function findApplicationByDiscordId(
  discordId: string,
): Promise<TournamentApplication | null> {
  const col = await applicationsCollection();
  const doc = await col.findOne(
    { discordId },
    { sort: { updatedAt: -1 } },
  );
  return doc ? (stripMongoId(doc) as TournamentApplication) : null;
}

export async function listApplications(): Promise<TournamentApplication[]> {
  const col = await applicationsCollection();
  const docs = await col.find({}, { sort: { createdAt: 1 } }).toArray();
  return docs.map((raw) => stripMongoId(raw) as TournamentApplication);
}

export async function deleteApplicationsByDiscordId(
  discordId: string,
): Promise<number> {
  const col = await applicationsCollection();
  const result = await col.deleteMany({ discordId });
  await leavePreferenceGroup(discordId);
  return result.deletedCount;
}

function preferenceGroupFromDoc(
  doc: PreferenceGroupDoc,
): TournamentPreferenceGroup {
  return {
    code: doc._id,
    memberDiscordIds: doc.memberDiscordIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizePreferenceGroupCode(code: string): string {
  const compact = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffix = compact.startsWith("LG") ? compact.slice(2) : compact;
  return suffix ? `LG-${suffix}` : "";
}

function generatePreferenceGroupCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let suffix = "";
  for (let index = 0; index < bytes.length; index += 1) {
    suffix += alphabet[bytes[index] % alphabet.length];
  }
  return `LG-${suffix}`;
}

export async function getPreferenceGroupForDiscordId(
  discordId: string,
): Promise<TournamentPreferenceGroup | null> {
  const col = await preferenceGroupsCollection();
  const doc = await col.findOne({ memberDiscordIds: discordId });
  return doc ? preferenceGroupFromDoc(doc) : null;
}

export async function listPreferenceGroups(): Promise<TournamentPreferenceGroup[]> {
  const col = await preferenceGroupsCollection();
  const docs = await col.find({}).sort({ createdAt: 1 }).toArray();
  return docs.map(preferenceGroupFromDoc);
}

export async function createPreferenceGroup(
  discordId: string,
): Promise<TournamentPreferenceGroup> {
  const application = await findApplicationByDiscordId(discordId);
  if (!application) {
    throw new Error("APPLICATION_REQUIRED");
  }

  const current = await getPreferenceGroupForDiscordId(discordId);
  if (current) return current;

  const col = await preferenceGroupsCollection();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generatePreferenceGroupCode();
    const now = new Date().toISOString();
    try {
      await col.insertOne({
        _id: code,
        memberDiscordIds: [discordId],
        createdAt: now,
        updatedAt: now,
      });
      return {
        code,
        memberDiscordIds: [discordId],
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      const duplicateKey =
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === 11000;
      if (!duplicateKey) throw error;

      const groupCreatedElsewhere =
        await getPreferenceGroupForDiscordId(discordId);
      if (groupCreatedElsewhere) return groupCreatedElsewhere;
    }
  }

  throw new Error("CODE_GENERATION_FAILED");
}

export async function joinPreferenceGroup(
  discordId: string,
  rawCode: string,
): Promise<TournamentPreferenceGroup> {
  const application = await findApplicationByDiscordId(discordId);
  if (!application) {
    throw new Error("APPLICATION_REQUIRED");
  }

  const code = normalizePreferenceGroupCode(rawCode);
  if (!/^LG-[A-Z2-9]{6}$/.test(code)) {
    throw new Error("INVALID_GROUP_CODE");
  }

  const current = await getPreferenceGroupForDiscordId(discordId);
  if (current?.code === code) return current;
  if (current) throw new Error("ALREADY_IN_GROUP");

  const col = await preferenceGroupsCollection();
  const target = await col.findOne({ _id: code });
  if (!target) throw new Error("INVALID_GROUP_CODE");
  if (target.memberDiscordIds.length >= TOURNAMENT_PREFERENCE_GROUP_LIMIT) {
    throw new Error("GROUP_FULL");
  }

  const result = await col.updateOne(
    {
      _id: code,
      memberDiscordIds: { $ne: discordId },
      "memberDiscordIds.4": { $exists: false },
    },
    {
      $addToSet: { memberDiscordIds: discordId },
      $set: { updatedAt: new Date().toISOString() },
    },
  );

  if (result.modifiedCount !== 1) {
    const refreshed = await col.findOne({ _id: code });
    if (!refreshed) throw new Error("INVALID_GROUP_CODE");
    if (refreshed.memberDiscordIds.includes(discordId)) {
      return preferenceGroupFromDoc(refreshed);
    }
    throw new Error("GROUP_FULL");
  }

  const updated = await col.findOne({ _id: code });
  if (!updated) throw new Error("INVALID_GROUP_CODE");
  return preferenceGroupFromDoc(updated);
}

export async function leavePreferenceGroup(discordId: string): Promise<void> {
  const col = await preferenceGroupsCollection();
  const current = await col.findOne({ memberDiscordIds: discordId });
  if (!current) return;

  const remaining = current.memberDiscordIds.filter(
    (memberDiscordId) => memberDiscordId !== discordId,
  );
  if (remaining.length === 0) {
    await col.deleteOne({ _id: current._id });
    return;
  }

  await col.updateOne(
    { _id: current._id },
    {
      $set: {
        memberDiscordIds: remaining,
        updatedAt: new Date().toISOString(),
      },
    },
  );
}

type ChallengeDoc = RiotVerificationChallenge & { _id: string };
type VerifiedDoc = VerifiedRiotAccount & { _id: string };

async function challengesCollection() {
  await ensureIndexes();
  return (await getDb()).collection<ChallengeDoc>(RIOT_CHALLENGES);
}

async function verifiedCollection() {
  return (await getDb()).collection<VerifiedDoc>(VERIFIED_RIOT);
}

export async function startRiotChallenge(input: {
  discordId: string;
  riotId: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  initialIconId: number;
  expectedIconId: number;
}): Promise<RiotVerificationChallenge> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MIN * 60 * 1000);
  const doc: RiotVerificationChallenge = {
    ...input,
    createdAt: now,
    expiresAt,
  };
  const col = await challengesCollection();
  await col.replaceOne(
    { _id: input.discordId },
    { ...doc },
    { upsert: true },
  );
  return doc;
}

export async function getRiotChallenge(
  discordId: string,
): Promise<RiotVerificationChallenge | null> {
  const col = await challengesCollection();
  const doc = await col.findOne({ _id: discordId });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  void _id;
  return rest as RiotVerificationChallenge;
}

export async function deleteRiotChallenge(discordId: string): Promise<void> {
  const col = await challengesCollection();
  await col.deleteOne({ _id: discordId });
}

export async function upsertVerifiedAccount(
  account: VerifiedRiotAccount,
): Promise<void> {
  const col = await verifiedCollection();
  await col.replaceOne(
    { _id: account.discordId },
    { ...account },
    { upsert: true },
  );
}

export async function updateVerifiedAccountSnapshot(
  discordId: string,
  patch: {
    riotId: string;
    gameName: string;
    tagLine: string;
    currentRankAuto: string | null;
  },
): Promise<void> {
  const col = await verifiedCollection();
  await col.updateOne(
    { _id: discordId },
    { $set: patch },
  );
}

export async function getVerifiedAccount(
  discordId: string,
): Promise<VerifiedRiotAccount | null> {
  const col = await verifiedCollection();
  const doc = await col.findOne({ _id: discordId });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  void _id;
  return rest as VerifiedRiotAccount;
}

export async function clearRiotLink(discordId: string): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection<VerifiedDoc>(VERIFIED_RIOT).deleteOne({ _id: discordId }),
    db.collection<ChallengeDoc>(RIOT_CHALLENGES).deleteOne({ _id: discordId }),
    db.collection<AppDoc>(APPLICATIONS).deleteMany({ discordId }),
    leavePreferenceGroup(discordId),
  ]);
}

export async function upsertMatch(
  id: string,
  patch: Partial<StoredTournamentMatch>,
): Promise<StoredTournamentMatch> {
  const col = await matchesCollection();
  // Split fields: explicit undefined = clear that field. Otherwise set.
  const $set: Record<string, unknown> = { id };
  const $unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "id") continue;
    if (value === undefined) {
      $unset[key] = "";
    } else {
      $set[key] = value;
    }
  }
  const update: Record<string, unknown> = { $set };
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  await col.updateOne({ _id: id }, update, { upsert: true });
  const doc = await col.findOne({ _id: id });
  return doc
    ? (stripMongoId(doc) as StoredTournamentMatch)
    : ({ ...patch, id } as StoredTournamentMatch);
}

function blacklistId(input: { discordId?: string; riotId?: string }) {
  const discordPart = input.discordId?.trim() || "-";
  const riotPart = input.riotId?.trim().toLowerCase() || "-";
  return `${discordPart}|${riotPart}`;
}

export async function listBlacklistEntries(): Promise<TournamentBlacklistEntry[]> {
  const col = await blacklistCollection();
  const docs = await col.find({}, { sort: { createdAt: -1 } }).toArray();
  return docs.map((raw) => stripMongoId(raw) as TournamentBlacklistEntry);
}

export async function addBlacklistEntry(input: {
  discordId?: string;
  riotId?: string;
  reason: string;
  createdBy?: string;
}): Promise<TournamentBlacklistEntry> {
  const entry: TournamentBlacklistEntry = {
    id: blacklistId(input),
    ...(input.discordId ? { discordId: input.discordId.trim() } : {}),
    ...(input.riotId ? { riotId: input.riotId.trim().toLowerCase() } : {}),
    reason: input.reason.trim(),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  const col = await blacklistCollection();
  await col.replaceOne({ _id: entry.id }, { ...entry }, { upsert: true });
  return entry;
}

export async function deleteBlacklistEntry(id: string): Promise<void> {
  const col = await blacklistCollection();
  await col.deleteOne({ _id: id });
}

export async function findBlacklistMatch(input: {
  discordId?: string;
  riotId?: string;
}): Promise<TournamentBlacklistEntry | null> {
  const clauses: Array<Record<string, string>> = [];
  if (input.discordId) clauses.push({ discordId: input.discordId });
  if (input.riotId) clauses.push({ riotId: input.riotId.trim().toLowerCase() });
  if (clauses.length === 0) return null;

  const col = await blacklistCollection();
  const doc = await col.findOne({ $or: clauses });
  return doc ? (stripMongoId(doc) as TournamentBlacklistEntry) : null;
}
