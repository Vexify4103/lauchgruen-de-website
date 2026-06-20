import { getDb } from "@/lib/mongo";
import { TOURNAMENT_APPLICATION_DEADLINE } from "@/lib/tournament-application-deadline";

export type TournamentSettings = {
	id: "default";
	activeTournament: {
		id: string;
		name: string;
		season: string;
		mode: "active" | "teaser";
	};
	applicationsOpen: boolean;
	applicationDeadlineOverride: boolean;
	applicationDeadline: string;
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
		activeTournament: {
			id: "az-2026",
			name: "Kunterbuntes A-Z Turnier",
			season: "A-Z Turnier 2026",
			mode: "active",
		},
		applicationsOpen: envFlag("TOURNAMENT_APPLICATIONS_ENABLED", true),
		applicationDeadlineOverride: envFlag("TOURNAMENT_APPLICATION_DEADLINE_BYPASS", false),
		applicationDeadline: TOURNAMENT_APPLICATION_DEADLINE,
		tournamentLive: envFlag("TOURNAMENT_LIVE", false),
		draftEnabled: envFlag("TOURNAMENT_DRAFT_ENABLED", true),
		updatedAt: new Date().toISOString(),
	};
}

function stripMongoId(doc: SettingsDoc): TournamentSettings {
	const { _id, ...rest } = doc;
	void _id;
	const defaults = defaultSettings();
	const deadline = typeof rest.applicationDeadline === "string" && !Number.isNaN(new Date(rest.applicationDeadline).getTime()) ? rest.applicationDeadline : defaults.applicationDeadline;
	return {
		...defaults,
		id: DOC_ID,
		activeTournament:
			rest.activeTournament &&
			typeof rest.activeTournament === "object" &&
			typeof rest.activeTournament.id === "string" &&
			typeof rest.activeTournament.name === "string" &&
			typeof rest.activeTournament.season === "string" &&
			(rest.activeTournament.mode === "active" || rest.activeTournament.mode === "teaser")
				? rest.activeTournament
				: defaults.activeTournament,
		applicationsOpen: typeof rest.applicationsOpen === "boolean" ? rest.applicationsOpen : defaults.applicationsOpen,
		applicationDeadlineOverride: typeof rest.applicationDeadlineOverride === "boolean" ? rest.applicationDeadlineOverride : defaults.applicationDeadlineOverride,
		applicationDeadline: deadline,
		tournamentLive: typeof rest.tournamentLive === "boolean" ? rest.tournamentLive : defaults.tournamentLive,
		draftEnabled: typeof rest.draftEnabled === "boolean" ? rest.draftEnabled : defaults.draftEnabled,
		updatedAt: typeof rest.updatedAt === "string" && !Number.isNaN(new Date(rest.updatedAt).getTime()) ? rest.updatedAt : defaults.updatedAt,
		updatedBy: rest.updatedBy,
	};
}

export async function getTournamentSettings(): Promise<TournamentSettings> {
	const db = await getDb();
	const doc = await db.collection<SettingsDoc>(COLLECTION).findOne({ _id: DOC_ID });
	return doc ? stripMongoId(doc) : defaultSettings();
}

export async function updateTournamentSettings(input: {
	patch: Partial<Pick<TournamentSettings, "activeTournament" | "applicationsOpen" | "applicationDeadlineOverride" | "applicationDeadline" | "tournamentLive" | "draftEnabled">>;
	updatedBy?: string;
}): Promise<TournamentSettings> {
	const now = new Date().toISOString();
	const $set: Partial<SettingsDoc> = {
		id: DOC_ID,
		updatedAt: now,
		updatedBy: input.updatedBy,
	};
	if (input.patch.activeTournament !== undefined) $set.activeTournament = input.patch.activeTournament;
	if (input.patch.applicationsOpen !== undefined) $set.applicationsOpen = input.patch.applicationsOpen;
	if (input.patch.applicationDeadlineOverride !== undefined) $set.applicationDeadlineOverride = input.patch.applicationDeadlineOverride;
	if (input.patch.applicationDeadline !== undefined) $set.applicationDeadline = input.patch.applicationDeadline;
	if (input.patch.tournamentLive !== undefined) $set.tournamentLive = input.patch.tournamentLive;
	if (input.patch.draftEnabled !== undefined) $set.draftEnabled = input.patch.draftEnabled;
	const db = await getDb();
	await db.collection<SettingsDoc>(COLLECTION).updateOne({ _id: DOC_ID }, { $set }, { upsert: true });
	return getTournamentSettings();
}
