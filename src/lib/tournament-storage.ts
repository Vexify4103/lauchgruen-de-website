import { playoffMatches, type GroupMatch } from "@/lib/tournament-data";
import { getDb } from "@/lib/mongo";

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

export type StoredTournamentMatch = {
  id: string;
  scoreA?: number;
  scoreB?: number;
  teamAChampions?: string[];
  teamBChampions?: string[];
  blueSide?: "teamA" | "teamB";
  status?: "Scheduled" | "Live" | "Finished" | "Locked" | "Pending";
  winner?: string;
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

async function applicationsCollection() {
  return (await getDb()).collection<AppDoc>(APPLICATIONS);
}

async function matchesCollection() {
  return (await getDb()).collection<MatchDoc>(MATCHES);
}

async function blacklistCollection() {
  return (await getDb()).collection<BlacklistDoc>(BLACKLIST);
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

export async function listApplications(): Promise<TournamentApplication[]> {
  const col = await applicationsCollection();
  const docs = await col.find({}, { sort: { createdAt: 1 } }).toArray();
  return docs.map((raw) => stripMongoId(raw) as TournamentApplication);
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
