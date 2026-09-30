import { getDb } from "@/lib/mongo";
import { TOURNAMENT_APPLICATION_DEADLINE, TOURNAMENT_APPLICATION_OPEN_AT } from "@/lib/tournament-application-deadline";
import { TOURNAMENT_MODES, type TournamentMode } from "@/lib/tournament-mode";
import { tournamentKind, type TournamentKind } from "@/lib/tournament-kind";

export { TOURNAMENT_MODES, type TournamentMode } from "@/lib/tournament-mode";
export { TOURNAMENT_KINDS, type TournamentKind } from "@/lib/tournament-kind";

export type TournamentSettings = {
	id: "default";
	activeTournament: {
		id: string;
		name: string;
		season: string;
		mode: TournamentMode;
		kind: TournamentKind;
	};
	applicationsOpen: boolean;
	applicationOpenAt: string | null;
	applicationDeadlineOverride: boolean;
	applicationDeadline: string;
	tournamentLive: boolean;
	draftEnabled: boolean;
	/** Champion locks for `fearless` tournaments. Played means picked in a completed draft. */
	fearless: {
		/** Also lock every champion the current opponent has played earlier in the tournament. */
		lockOpponentChampions: boolean;
	};
	/**
	 * Tournament structure for every flexible-engine kind (Ultimate Bravery and Fearless).
	 * The key keeps its original name so existing settings documents stay readable.
	 */
	ultimateBravery: {
		startAt: string | null;
		dayTwoStartAt: string | null;
		teamCount: number;
		playersPerTeam: number;
		dayOneFormat: "undecided" | "groups" | "swiss";
		groupCount: number;
		groupRoundRobinLegs: 1 | 2;
		swissRounds: number;
		advanceTeamCount: number;
		format: "undecided" | "double-elimination" | "double-elimination-light" | "single-elimination";
		minimumSummonerLevel: number;
		rerollsPerPlayer: number;
		prizePool: string;
	};
	updatedAt: string;
	updatedBy?: string;
};

type SettingsDoc = TournamentSettings & { _id: string };

const COLLECTION = "tournament_settings";
const DOC_ID = "default";
const LEGACY_AZ_APPLICATION_DEADLINE = "2026-06-18T20:00:00+02:00";

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
			mode: "preparation",
			kind: "az",
		},
		applicationsOpen: envFlag("TOURNAMENT_APPLICATIONS_ENABLED", true),
		applicationOpenAt: TOURNAMENT_APPLICATION_OPEN_AT,
		applicationDeadlineOverride: envFlag("TOURNAMENT_APPLICATION_DEADLINE_BYPASS", false),
		applicationDeadline: TOURNAMENT_APPLICATION_DEADLINE,
		tournamentLive: envFlag("TOURNAMENT_LIVE", false),
		draftEnabled: envFlag("TOURNAMENT_DRAFT_ENABLED", true),
		fearless: { lockOpponentChampions: false },
		ultimateBravery: {
			startAt: null,
			dayTwoStartAt: null,
			teamCount: 4,
			playersPerTeam: 5,
			dayOneFormat: "groups",
			groupCount: 1,
			groupRoundRobinLegs: 1,
			swissRounds: 3,
			advanceTeamCount: 4,
			format: "double-elimination",
			minimumSummonerLevel: 100,
			rerollsPerPlayer: 2,
			prizePool: "Wird noch angekündigt",
		},
		updatedAt: new Date().toISOString(),
	};
}

function stripMongoId(doc: SettingsDoc): TournamentSettings {
	const { _id, ...rest } = doc;
	void _id;
	const defaults = defaultSettings();
	const openAt =
		typeof rest.applicationOpenAt === "string" && !Number.isNaN(new Date(rest.applicationOpenAt).getTime())
			? rest.applicationOpenAt
			: rest.applicationOpenAt === null
				? null
				: defaults.applicationOpenAt;
	const deadline =
		typeof rest.applicationDeadline === "string" && rest.applicationDeadline !== LEGACY_AZ_APPLICATION_DEADLINE && !Number.isNaN(new Date(rest.applicationDeadline).getTime())
			? rest.applicationDeadline
			: defaults.applicationDeadline;
	const rawUltimateBravery = rest.ultimateBravery && typeof rest.ultimateBravery === "object" ? rest.ultimateBravery : {};
	const storedDates = rawUltimateBravery as Partial<TournamentSettings["ultimateBravery"]>;
	const mergedUltimateBravery = {
		...defaults.ultimateBravery,
		...rawUltimateBravery,
		startAt: normalizeOptionalDate(storedDates.startAt, defaults.ultimateBravery.startAt),
		dayTwoStartAt: normalizeOptionalDate(storedDates.dayTwoStartAt, defaults.ultimateBravery.dayTwoStartAt),
	};
	const teamCount = clampInteger(mergedUltimateBravery.teamCount, 2, 32, defaults.ultimateBravery.teamCount);
	const ultimateBravery: TournamentSettings["ultimateBravery"] = {
		...mergedUltimateBravery,
		teamCount,
		playersPerTeam: clampInteger(mergedUltimateBravery.playersPerTeam, 5, 10, defaults.ultimateBravery.playersPerTeam),
		dayOneFormat: mergedUltimateBravery.dayOneFormat === "swiss" || mergedUltimateBravery.dayOneFormat === "groups" ? mergedUltimateBravery.dayOneFormat : "undecided",
		groupCount: clampInteger(mergedUltimateBravery.groupCount, 1, teamCount, defaults.ultimateBravery.groupCount),
		groupRoundRobinLegs: mergedUltimateBravery.groupRoundRobinLegs === 2 ? 2 : 1,
		swissRounds: clampInteger(mergedUltimateBravery.swissRounds, 1, 10, defaults.ultimateBravery.swissRounds),
		advanceTeamCount: clampInteger(mergedUltimateBravery.advanceTeamCount, 2, teamCount, Math.min(defaults.ultimateBravery.advanceTeamCount, teamCount)),
		format:
			mergedUltimateBravery.format === "single-elimination" ||
			mergedUltimateBravery.format === "double-elimination" ||
			mergedUltimateBravery.format === "double-elimination-light"
				? mergedUltimateBravery.format
				: "undecided",
		minimumSummonerLevel: clampInteger(mergedUltimateBravery.minimumSummonerLevel, 1, 1000, defaults.ultimateBravery.minimumSummonerLevel),
		rerollsPerPlayer: clampInteger(mergedUltimateBravery.rerollsPerPlayer, 0, 5, defaults.ultimateBravery.rerollsPerPlayer),
		prizePool:
			typeof mergedUltimateBravery.prizePool === "string" && mergedUltimateBravery.prizePool.trim() ? mergedUltimateBravery.prizePool : defaults.ultimateBravery.prizePool,
	};
	if (ultimateBravery.dayOneFormat === "swiss") {
		const allTeamsAdvance = ultimateBravery.advanceTeamCount === ultimateBravery.teamCount;
		const winsToAdvance = Math.max(2, Math.ceil(Math.log2(teamCount)) - 1);
		ultimateBravery.advanceTeamCount = allTeamsAdvance ? teamCount : Math.max(2, Math.floor(teamCount / 2));
		ultimateBravery.swissRounds = allTeamsAdvance ? (teamCount === 8 ? 4 : Math.max(2, Math.ceil(Math.log2(teamCount)) + 1)) : winsToAdvance * 2 - 1;
	}
	return {
		...defaults,
		id: DOC_ID,
		activeTournament: normalizeActiveTournament(rest.activeTournament, defaults.activeTournament),
		applicationsOpen: typeof rest.applicationsOpen === "boolean" ? rest.applicationsOpen : defaults.applicationsOpen,
		applicationOpenAt: openAt,
		applicationDeadlineOverride: typeof rest.applicationDeadlineOverride === "boolean" ? rest.applicationDeadlineOverride : defaults.applicationDeadlineOverride,
		applicationDeadline: deadline,
		tournamentLive: typeof rest.tournamentLive === "boolean" ? rest.tournamentLive : defaults.tournamentLive,
		draftEnabled: typeof rest.draftEnabled === "boolean" ? rest.draftEnabled : defaults.draftEnabled,
		fearless: {
			lockOpponentChampions: typeof rest.fearless?.lockOpponentChampions === "boolean" ? rest.fearless.lockOpponentChampions : defaults.fearless.lockOpponentChampions,
		},
		ultimateBravery,
		updatedAt: typeof rest.updatedAt === "string" && !Number.isNaN(new Date(rest.updatedAt).getTime()) ? rest.updatedAt : defaults.updatedAt,
		updatedBy: rest.updatedBy,
	};
}

function normalizeActiveTournament(raw: unknown, fallback: TournamentSettings["activeTournament"]): TournamentSettings["activeTournament"] {
	if (!raw || typeof raw !== "object") return fallback;
	const value = raw as Partial<Record<keyof TournamentSettings["activeTournament"], unknown>>;
	if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.season !== "string") return fallback;
	// "active" was the pre-mode name for preparation.
	const mode = TOURNAMENT_MODES.includes(value.mode as TournamentMode) ? (value.mode as TournamentMode) : value.mode === "active" ? "preparation" : null;
	if (!mode) return fallback;
	return { id: value.id, name: value.name, season: value.season, mode, kind: tournamentKind({ id: value.id, kind: value.kind as TournamentKind | undefined }) };
}

/** `null` means "not announced yet" and must survive normalisation; only missing or invalid values fall back. */
function normalizeOptionalDate(value: unknown, fallback: string | null): string | null {
	if (value === null) return null;
	return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : fallback;
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export async function getTournamentSettings(): Promise<TournamentSettings> {
	const db = await getDb();
	const doc = await db.collection<SettingsDoc>(COLLECTION).findOne({ _id: DOC_ID });
	return doc ? stripMongoId(doc) : defaultSettings();
}

export async function updateTournamentSettings(input: {
	patch: Partial<
		Pick<
			TournamentSettings,
			| "activeTournament"
			| "applicationsOpen"
			| "applicationOpenAt"
			| "applicationDeadlineOverride"
			| "applicationDeadline"
			| "tournamentLive"
			| "draftEnabled"
			| "fearless"
			| "ultimateBravery"
		>
	>;
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
	if (input.patch.applicationOpenAt !== undefined) $set.applicationOpenAt = input.patch.applicationOpenAt;
	if (input.patch.applicationDeadlineOverride !== undefined) $set.applicationDeadlineOverride = input.patch.applicationDeadlineOverride;
	if (input.patch.applicationDeadline !== undefined) $set.applicationDeadline = input.patch.applicationDeadline;
	if (input.patch.tournamentLive !== undefined) $set.tournamentLive = input.patch.tournamentLive;
	if (input.patch.draftEnabled !== undefined) $set.draftEnabled = input.patch.draftEnabled;
	if (input.patch.fearless !== undefined) $set.fearless = input.patch.fearless;
	if (input.patch.ultimateBravery !== undefined) $set.ultimateBravery = input.patch.ultimateBravery;
	const db = await getDb();
	await db.collection<SettingsDoc>(COLLECTION).updateOne({ _id: DOC_ID }, { $set }, { upsert: true });
	return getTournamentSettings();
}
