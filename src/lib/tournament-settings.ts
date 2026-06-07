import { getDb } from "@/lib/mongo";

export type TournamentSettings = {
  id: "default";
  applicationsOpen: boolean;
  tournamentLive: boolean;
  draftEnabled: boolean;
  updatedAt: string;
  updatedBy?: string;
};

type SettingsDoc = TournamentSettings & { _id: string };

const COLLECTION = "tournament_settings";
const DOC_ID = "default";

function envFlag(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value !== "false" && value !== "0";
}

function defaultSettings(): TournamentSettings {
  return {
    id: DOC_ID,
    applicationsOpen: envFlag("TOURNAMENT_APPLICATIONS_ENABLED", true),
    tournamentLive: envFlag("TOURNAMENT_LIVE", false),
    draftEnabled: envFlag("TOURNAMENT_DRAFT_ENABLED", true),
    updatedAt: new Date().toISOString(),
  };
}

function stripMongoId(doc: SettingsDoc): TournamentSettings {
  const { _id, ...rest } = doc;
  void _id;
  return {
    ...defaultSettings(),
    ...rest,
    id: DOC_ID,
  };
}

export async function getTournamentSettings(): Promise<TournamentSettings> {
  const db = await getDb();
  const doc = await db.collection<SettingsDoc>(COLLECTION).findOne({ _id: DOC_ID });
  return doc ? stripMongoId(doc) : defaultSettings();
}

export async function updateTournamentSettings(input: {
  patch: Partial<Pick<TournamentSettings, "applicationsOpen" | "tournamentLive" | "draftEnabled">>;
  updatedBy?: string;
}): Promise<TournamentSettings> {
  const now = new Date().toISOString();
  const $set: Partial<SettingsDoc> = {
    ...input.patch,
    id: DOC_ID,
    updatedAt: now,
    updatedBy: input.updatedBy,
  };
  const db = await getDb();
  await db
    .collection<SettingsDoc>(COLLECTION)
    .updateOne({ _id: DOC_ID }, { $set }, { upsert: true });
  return getTournamentSettings();
}
