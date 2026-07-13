import { getDb } from "@/lib/mongo";
import { TOURNAMENT_APPLICATION_DEADLINE, TOURNAMENT_APPLICATION_OPEN_AT } from "@/lib/tournament-application-deadline";
import { TOURNAMENT_MODES, type TournamentMode } from "@/lib/tournament-mode";

export { TOURNAMENT_MODES, type TournamentMode } from "@/lib/tournament-mode";

export type TournamentSettings = {
	id: "default";
	activeTournament: {
		id: string;
		name: string;
		season: string;
		mode: TournamentMode;
	};
	applicationsOpen: boolean;
	applicationOpenAt: string | null;
	applicationDeadlineOverride: boolean;
	applicationDeadline: string;
	tournamentLive: boolean;
	draftEnabled: boolean;
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
		format: "undecided" | "double-elimination" | "single-elimination";
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
const LEGACY_ULTIMATE_BRAVERY_START_AT = "2026-09-05T18:00:00+02:00";
const LEGACY_ULTIMATE_BRAVERY_DAY_TWO_START_AT = "2026-09-06T18:00:00+02:00";

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
		},
		applicationsOpen: envFlag("TOURNAMENT_APPLICATIONS_ENABLED", true),
		applicationOpenAt: TOURNAMENT_APPLICATION_OPEN_AT,
		applicationDeadlineOverride: envFlag("TOURNAMENT_APPLICATION_DEADLINE_BYPASS", false),
		applicationDeadline: TOURNAMENT_APPLICATION_DEADLINE,
		tournamentLive: envFlag("TOURNAMENT_LIVE", false),
		draftEnabled: envFlag("TOURNAMENT_DRAFT_ENABLED", true),
		ultimateBravery: {
			startAt: "2026-09-04T18:00:00+02:00",
			dayTwoStartAt: "2026-09-05T18:00:00+02:00",
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
	const storedStartAt = (rawUltimateBravery as TournamentSettings["ultimateBravery"]).startAt;
	const storedDayTwoStartAt = (rawUltimateBravery as TournamentSettings["ultimateBravery"]).dayTwoStartAt;
	const hasLegacyWrongUltimateBraveryDates = storedStartAt === LEGACY_ULTIMATE_BRAVERY_START_AT && storedDayTwoStartAt === LEGACY_ULTIMATE_BRAVERY_DAY_TWO_START_AT;
	const mergedUltimateBravery = {
		...defaults.ultimateBravery,
		...rawUltimateBravery,
		startAt: hasLegacyWrongUltimateBraveryDates
			? defaults.ultimateBravery.startAt
			: typeof (rawUltimateBravery as TournamentSettings["ultimateBravery"]).startAt === "string" &&
				  !Number.isNaN(new Date((rawUltimateBravery as TournamentSettings["ultimateBravery"]).startAt!).getTime())
				? (rawUltimateBravery as TournamentSettings["ultimateBravery"]).startAt
				: defaults.ultimateBravery.startAt,
		dayTwoStartAt: hasLegacyWrongUltimateBraveryDates
			? defaults.ultimateBravery.dayTwoStartAt
			: typeof (rawUltimateBravery as TournamentSettings["ultimateBravery"]).dayTwoStartAt === "string" &&
				  !Number.isNaN(new Date((rawUltimateBravery as TournamentSettings["ultimateBravery"]).dayTwoStartAt!).getTime())
				? (rawUltimateBravery as TournamentSettings["ultimateBravery"]).dayTwoStartAt
				: defaults.ultimateBravery.dayTwoStartAt,
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
		format: mergedUltimateBravery.format === "single-elimination" || mergedUltimateBravery.format === "double-elimination" ? mergedUltimateBravery.format : "undecided",
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
		activeTournament:
			rest.activeTournament &&
			typeof rest.activeTournament === "object" &&
			typeof rest.activeTournament.id === "string" &&
			typeof rest.activeTournament.name === "string" &&
			typeof rest.activeTournament.season === "string" &&
			TOURNAMENT_MODES.includes((rest.activeTournament as { mode?: unknown }).mode as TournamentMode)
				? (rest.activeTournament as TournamentSettings["activeTournament"])
				: (rest.activeTournament as { mode?: unknown }).mode === "active"
					? { ...rest.activeTournament, mode: "preparation" }
					: defaults.activeTournament,
		applicationsOpen: typeof rest.applicationsOpen === "boolean" ? rest.applicationsOpen : defaults.applicationsOpen,
		applicationOpenAt: openAt,
		applicationDeadlineOverride: typeof rest.applicationDeadlineOverride === "boolean" ? rest.applicationDeadlineOverride : defaults.applicationDeadlineOverride,
		applicationDeadline: deadline,
		tournamentLive: typeof rest.tournamentLive === "boolean" ? rest.tournamentLive : defaults.tournamentLive,
		draftEnabled: typeof rest.draftEnabled === "boolean" ? rest.draftEnabled : defaults.draftEnabled,
		ultimateBravery,
		updatedAt: typeof rest.updatedAt === "string" && !Number.isNaN(new Date(rest.updatedAt).getTime()) ? rest.updatedAt : defaults.updatedAt,
		updatedBy: rest.updatedBy,
	};
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
	if (input.patch.ultimateBravery !== undefined) $set.ultimateBravery = input.patch.ultimateBravery;
	const db = await getDb();
	await db.collection<SettingsDoc>(COLLECTION).updateOne({ _id: DOC_ID }, { $set }, { upsert: true });
	return getTournamentSettings();
}
