import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";
import { computeGroupStandings, resolvePlayoffMatches, type ResolvedPlayoffMatch } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { readTournamentState, type StoredTournamentMatch } from "@/lib/tournament-storage";
import { clearDraftStates, listDraftStates, type TournamentDraftState } from "@/lib/tournament-draft";
import { clearTournamentWheel, getTournamentWheelState, type TournamentWheelState } from "@/lib/tournament-wheel";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
import { getTournamentSettings, updateTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";
import type { GroupMatch, TournamentTeam } from "@/lib/tournament-data";
import { getMatchControlContext, type ControlMatch } from "@/lib/match-control";
import { resolveTournamentCompletion } from "@/lib/tournament-completion";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { TOURNAMENT_KIND_LABELS, usesFlexibleEngine, usesUltimateBravery, type TournamentKind } from "@/lib/tournament-kind";
import { getSwissStageState, type SwissStageState } from "@/lib/tournament-swiss";
import { clearUltimateBraveryRolls, listAllUltimateBraveryRolls, type UltimateBraveryRoll } from "@/lib/ultimate-bravery";
import { clearPlayIn, type PlayInPair } from "@/lib/tournament-play-in";
import { clearStandingOverrides, type StandingOverrides } from "@/lib/tournament-standing-overrides";
import type { StandingsResult } from "@/lib/tournament-standings";
import type { DayOneFormat } from "@/lib/tournament-structure";
import type { SeriesGame } from "@/lib/tournament-series";
import { getDefaultRulesMarkdown } from "@/lib/tournament-rulebook";

type ArchivedPlayer = Pick<TournamentTeam["players"][number], "name" | "role" | "riotId" | "verified" | "opggUrl" | "dpmUrl">;
type ArchivedTeam = Omit<TournamentTeam, "captainRef" | "discordRoleId" | "players"> & { players: ArchivedPlayer[] };
type ArchivedDraft = Pick<TournamentDraftState, "matchId" | "updatedAt"> & {
	actions: Array<Pick<TournamentDraftState["actions"][number], "side" | "kind" | "champion" | "lockedAt">>;
};

export type ArchivedControlMatch = Omit<ControlMatch, "adminNote">;
export type ArchivedUltimateBraveryRoll = Pick<
	UltimateBraveryRoll,
	"matchId" | "teamName" | "riotId" | "role" | "champion" | "startingItems" | "items" | "summonerSpells" | "runes" | "rollNumber" | "rerollsUsed"
>;

export type TournamentArchiveSnapshot = {
	information?: { description: string; rulesMarkdown: string };
	/** Missing on archives created before tournament kinds existed (the A-Z event). */
	kind?: TournamentKind;
	teams: ArchivedTeam[];
	groupMatches: GroupMatch[];
	matches: Record<string, Omit<StoredTournamentMatch, "adminNote">>;
	playoffs: ResolvedPlayoffMatch[];
	standings: ReturnType<typeof computeGroupStandings>;
	wheel: Omit<TournamentWheelState, "currentAssignment"> & {
		currentAssignment: Omit<NonNullable<TournamentWheelState["currentAssignment"]>, "spunBy"> | null;
	};
	drafts: ArchivedDraft[];
	/** Flexible-engine tournaments: structure, every resolved match and the Swiss stage. */
	structure?: TournamentSettings["ultimateBravery"];
	controlMatches?: ArchivedControlMatch[];
	swiss?: SwissStageState;
	fearless?: TournamentSettings["fearless"];
	ultimateBraveryRolls?: ArchivedUltimateBraveryRoll[];
	/** Flexible engine: play-in pairs, final tables and staff decisions for ties. */
	playIn?: PlayInPair[];
	stageTables?: {
		groups: Array<{ group: string; teams: string[]; standings: StandingsResult | null; placements: Record<number, string | null> | null }>;
		swissStandings: StandingsResult | null;
		playoffTable: StandingsResult | null;
		overrides: StandingOverrides;
	};
};

export type TournamentArchive = {
	id: string;
	title: string;
	season: string;
	dateLabel: string;
	format: string;
	championTeam: string;
	finalistTeam?: string;
	thirdPlaceTeam?: string;
	championRoster: string[];
	note?: string;
	vodUrl?: string;
	highlightUrl?: string;
	snapshot?: TournamentArchiveSnapshot;
	createdAt: string;
	createdBy?: string;
};

export type TournamentTemplate = {
	id: string;
	name: string;
	game: string;
	format: string;
	teamCount: number;
	groupCount: number;
	doubleRoundRobin: boolean;
	draftMode: "tournament" | "none";
	poolMode: "az" | "none";
	notes: string;
	createdAt: string;
	updatedAt: string;
	createdBy?: string;
};

export type CaptainCheckIn = {
	matchId: string;
	teamName: string;
	captainDiscordId: string;
	rosterConfirmed: boolean;
	rulesConfirmed: boolean;
	checkedAt: string;
};

export type TournamentMatchReport = {
	id: string;
	matchId: string;
	teamName: string;
	captainDiscordId: string;
	declaredWinner: boolean;
	gameDuration?: string;
	screenshotUrl?: string;
	note?: string;
	createdAt: string;
	reviewedAt?: string;
	reviewedBy?: string;
};

export type FeedbackDashboard = {
	id: "default";
	formUrl: string;
	responses: number;
	overallRating?: number;
	balanceRating?: number;
	draftRating?: number;
	websiteRating?: number;
	organisationRating?: number;
	highlights?: string;
	actions?: string;
	updatedAt: string;
	updatedBy?: string;
};

const ARCHIVES = "tournament_archives";
const TEMPLATES = "tournament_templates";
const CHECK_INS = "tournament_captain_checkins";
const REPORTS = "tournament_match_reports";
const FEEDBACK = "tournament_feedback_dashboard";

function withoutId<T extends Record<string, unknown>>(document: T): Omit<T, "_id"> {
	const { _id, ...rest } = document;
	void _id;
	return rest;
}

export async function listTournamentArchives(): Promise<TournamentArchive[]> {
	const docs = await (await getDb()).collection<TournamentArchive & { _id: string }>(ARCHIVES).find({}).sort({ createdAt: -1 }).toArray();
	return docs.map((doc) => withoutId(doc) as TournamentArchive);
}

export async function upsertTournamentArchive(input: Omit<TournamentArchive, "id" | "createdAt"> & Partial<Pick<TournamentArchive, "id" | "createdAt">>) {
	const archive: TournamentArchive = {
		...input,
		id: input.id ?? randomUUID(),
		createdAt: input.createdAt ?? new Date().toISOString(),
	};
	await (await getDb())
		.collection<TournamentArchive & { _id: string }>(ARCHIVES)
		.replaceOne({ _id: archive.id }, { ...archive, _id: archive.id } as unknown as TournamentArchive & { _id: string }, { upsert: true });
	return archive;
}

export async function getTournamentArchive(id: string): Promise<TournamentArchive | null> {
	const doc = await (await getDb()).collection<TournamentArchive & { _id: string }>(ARCHIVES).findOne({ _id: id });
	return doc ? (withoutId(doc) as TournamentArchive) : null;
}

function publicTeam(team: TournamentTeam): ArchivedTeam {
	const { captainRef: _captainRef, discordRoleId: _discordRoleId, players, ...rest } = team;
	void _captainRef;
	void _discordRoleId;
	return {
		...rest,
		players: players.map(({ discordId: _discordId, discordUsername: _discordUsername, ...player }) => {
			void _discordId;
			void _discordUsername;
			return player;
		}),
	};
}

/** Series games without the admin who recorded them. */
function publicGames(games: SeriesGame[] | undefined): SeriesGame[] | undefined {
	return games?.map(({ recordedBy: _recordedBy, ...game }) => {
		void _recordedBy;
		return game;
	});
}

function publicMatch(match: StoredTournamentMatch): Omit<StoredTournamentMatch, "adminNote"> {
	const { adminNote: _adminNote, ...rest } = match;
	void _adminNote;
	return rest.games ? { ...rest, games: publicGames(rest.games) } : rest;
}

function publicWheel(wheel: TournamentWheelState): TournamentArchiveSnapshot["wheel"] {
	const assignment = (entry: TournamentWheelState["currentAssignment"]) => {
		if (!entry) return null;
		const { spunBy: _spunBy, ...rest } = entry;
		void _spunBy;
		return rest;
	};
	return {
		...wheel,
		currentAssignment: assignment(wheel.currentAssignment),
		history: wheel.history.map((entry) => assignment(entry)!).filter(Boolean),
	};
}

function publicControlMatch(match: ControlMatch): ArchivedControlMatch {
	const { adminNote: _adminNote, ...rest } = match;
	void _adminNote;
	return { ...rest, games: publicGames(rest.games) ?? [] };
}

function publicRoll(roll: UltimateBraveryRoll): ArchivedUltimateBraveryRoll {
	const { matchId, teamName, riotId, role, champion, startingItems, items, summonerSpells, runes, rollNumber, rerollsUsed } = roll;
	return { matchId, teamName, riotId, role, champion, startingItems, items, summonerSpells, runes, rollNumber, rerollsUsed };
}

function publicDrafts(drafts: TournamentDraftState[]): ArchivedDraft[] {
	return drafts.map((draft) => ({
		matchId: draft.matchId,
		updatedAt: draft.updatedAt,
		actions: draft.actions.map(({ side, kind, champion, lockedAt }) => ({ side, kind, champion, lockedAt })),
	}));
}

function archiveRoleCleanupOperations(teams: TournamentTeam[]): DiscordOperation[] {
	const operations: DiscordOperation[] = [];
	const captainRoleId = process.env.DISCORD_CAPTAINS_ROLE_ID?.trim();
	for (const team of teams) {
		for (const player of team.players) {
			if (!player.discordId) continue;
			if (team.discordRoleId)
				operations.push({ kind: "role", discordId: player.discordId, roleId: team.discordRoleId, enabled: false, label: `${player.name}: Teamrolle entfernen` });
		}
		if (captainRoleId && team.captainRef?.discordId) {
			operations.push({ kind: "role", discordId: team.captainRef.discordId, roleId: captainRoleId, enabled: false, label: `${team.name}: Captain-Rolle entfernen` });
		}
	}
	return operations;
}

export type NextTournamentInput = {
	id: string;
	name: string;
	season: string;
	kind: TournamentKind;
};

function formatArchiveDate(value: string | null) {
	return value ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(value)) : null;
}

export function archiveDateLabel(structure: TournamentSettings["ultimateBravery"]): string {
	const first = formatArchiveDate(structure.startAt);
	const second = formatArchiveDate(structure.dayTwoStartAt);
	if (first && second && first !== second) return `${first.slice(0, 6)}–${second}`;
	return first ?? second ?? "Datum unbekannt";
}

const ARCHIVE_STAGE_LABELS: Record<DayOneFormat, string | null> = {
	undecided: null,
	none: null,
	groups: "Gruppenphase",
	gsl: "GSL-Gruppen",
	swiss: "Swiss Stage",
	"swiss-elimination": "Swiss mit Ausscheiden",
};

export function archiveFormatLabel(kind: TournamentKind, structure: TournamentSettings["ultimateBravery"]): string {
	const playIn = structure.playInTeamCount > 0 ? "Play-in" : null;
	const series = structure.bestOf.finals > 1 ? `Finale Bo${structure.bestOf.finals}` : null;
	return [playIn, ARCHIVE_STAGE_LABELS[structure.dayOneFormat], playoffFormatLabel(structure.format), series, TOURNAMENT_KIND_LABELS[kind]].filter(Boolean).join(" + ");
}

/**
 * Freezes the active tournament into `tournament_archives`, clears every
 * per-tournament collection and switches the site to the next tournament in
 * teaser mode. Only a finished tournament with a decided grand final can be archived.
 */
export async function archiveActiveTournament(input: { note?: string; vodUrl?: string; highlightUrl?: string; createdBy?: string; next: NextTournamentInput }) {
	const settings = await getTournamentSettings();
	const active = settings.activeTournament;
	if (active.mode !== "finished") throw new Error("Nur ein abgeschlossenes Turnier kann archiviert werden.");
	if (await getTournamentArchive(active.id)) throw new Error("Dieses Turnier wurde bereits archiviert.");
	if (input.next.id === active.id || (await getTournamentArchive(input.next.id))) throw new Error("Die ID des nächsten Turniers ist bereits vergeben.");

	const [ctx, control] = await Promise.all([getTournamentContext(), getMatchControlContext()]);
	const completion = resolveTournamentCompletion(control.matches);
	if (!completion) throw new Error("Das Grand Final hat noch kein gültiges Ergebnis.");
	const champion = ctx.teams.find((team) => team.name === completion.championTeamName);
	if (!champion) throw new Error("Das Gewinnerteam wurde im aktuellen Turnier nicht gefunden.");

	const flexible = usesFlexibleEngine(active);
	const [state, wheel, drafts, swiss, rolls] = await Promise.all([
		readTournamentState(ctx.groupMatches),
		getTournamentWheelState(),
		listDraftStates(),
		flexible && (settings.ultimateBravery.dayOneFormat === "swiss" || settings.ultimateBravery.dayOneFormat === "swiss-elimination")
			? getSwissStageState(active.id)
			: Promise.resolve(null),
		usesUltimateBravery(active) ? listAllUltimateBraveryRolls() : Promise.resolve([]),
	]);
	const snapshot: TournamentArchiveSnapshot = {
		information: { description: active.description ?? "", rulesMarkdown: active.rulesMarkdown?.trim() || getDefaultRulesMarkdown(settings) },
		kind: active.kind,
		teams: ctx.teams.map(publicTeam),
		groupMatches: ctx.groupMatches,
		matches: Object.fromEntries(Object.entries(state.matches).map(([id, match]) => [id, publicMatch(match)])),
		playoffs: flexible ? [] : resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches),
		standings: computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches),
		wheel: publicWheel(wheel),
		drafts: publicDrafts(drafts),
		...(flexible
			? {
					structure: settings.ultimateBravery,
					controlMatches: control.matches.map(publicControlMatch),
					swiss: swiss ?? undefined,
				}
			: {}),
		...(active.kind === "fearless" ? { fearless: settings.fearless } : {}),
		...(rolls.length > 0 ? { ultimateBraveryRolls: rolls.map(publicRoll) } : {}),
		...(control.stages
			? {
					...(control.stages.playIn ? { playIn: control.stages.playIn.pairs } : {}),
					stageTables: {
						groups: control.stages.dayOne.groups.map(({ group, teams, standings, placements }) => ({ group, teams, standings, placements })),
						swissStandings: control.stages.dayOne.swissStandings,
						playoffTable: control.stages.playoffs.table,
						overrides: control.stages.overrides,
					},
				}
			: {}),
	};
	const archive = await upsertTournamentArchive({
		id: active.id,
		title: active.name,
		season: active.season,
		dateLabel: archiveDateLabel(settings.ultimateBravery),
		format: flexible ? archiveFormatLabel(active.kind, settings.ultimateBravery) : "Gruppenphase + Double Elimination + A-Z Pools",
		championTeam: completion.championTeamName,
		finalistTeam: completion.finalistTeamName,
		championRoster: champion.players.map((player) => player.riotId),
		note: input.note,
		vodUrl: input.vodUrl,
		highlightUrl: input.highlightUrl,
		snapshot,
		createdBy: input.createdBy,
	});

	const db = await getDb();
	const cleanupOperations = archiveRoleCleanupOperations(ctx.teams);
	await Promise.all([
		db.collection("tournament_applications").deleteMany({}),
		db.collection("tournament_matches").deleteMany({}),
		db.collection("tournament_preference_groups").deleteMany({}),
		db.collection("tournament_captain_checkins").deleteMany({}),
		db.collection("tournament_match_reports").deleteMany({}),
		db.collection("tournament_roster_drafts").deleteMany({}),
		db
			.collection<{ _id: string; teams?: Record<string, unknown> }>("bot_state")
			.updateOne({ _id: "default" }, { $set: { teams: {} }, $unset: { rosterPublishedAt: "" } }, { upsert: true }),
		clearDraftStates(),
		clearTournamentWheel(),
		clearUltimateBraveryRolls(),
		clearPlayIn(),
		clearStandingOverrides(active.id),
	]);
	await updateTournamentSettings({
		patch: {
			activeTournament: { ...input.next, mode: "teaser" },
			applicationsOpen: false,
			applicationDeadlineOverride: false,
			tournamentLive: false,
			draftEnabled: input.next.kind !== "ultimate-bravery",
			ultimateBravery: {
				...settings.ultimateBravery,
				startAt: null,
				dayTwoStartAt: null,
				dayOneFormat: "undecided",
				format: "undecided",
				prizePool: "Wird noch angekündigt",
			},
		},
		updatedBy: input.createdBy,
	});
	const discordJob = await enqueueDiscordJob({
		type: "archive-role-cleanup",
		title: `${active.name}: Turnierrollen entfernen`,
		operations: cleanupOperations,
		actorLabel: input.createdBy,
	});
	return { archive, discordJobId: discordJob?.id, cleanupOperationCount: cleanupOperations.length };
}

export async function listTournamentTemplates(): Promise<TournamentTemplate[]> {
	const docs = await (await getDb()).collection<TournamentTemplate & { _id: string }>(TEMPLATES).find({}).sort({ updatedAt: -1 }).toArray();
	return docs.map((doc) => withoutId(doc) as TournamentTemplate);
}

export async function upsertTournamentTemplate(input: Omit<TournamentTemplate, "id" | "createdAt" | "updatedAt"> & Partial<Pick<TournamentTemplate, "id" | "createdAt">>) {
	const now = new Date().toISOString();
	const template: TournamentTemplate = {
		...input,
		id: input.id ?? randomUUID(),
		createdAt: input.createdAt ?? now,
		updatedAt: now,
	};
	await (await getDb())
		.collection<TournamentTemplate & { _id: string }>(TEMPLATES)
		.replaceOne({ _id: template.id }, { ...template, _id: template.id } as unknown as TournamentTemplate & { _id: string }, { upsert: true });
	return template;
}

export async function getCaptainCheckIn(matchId: string, teamName: string): Promise<CaptainCheckIn | null> {
	const doc = await (await getDb()).collection<CaptainCheckIn & { _id: string }>(CHECK_INS).findOne({ _id: `${matchId}|${teamName}` });
	return doc ? (withoutId(doc) as CaptainCheckIn) : null;
}

export async function upsertCaptainCheckIn(input: CaptainCheckIn) {
	await (await getDb())
		.collection<CaptainCheckIn & { _id: string }>(CHECK_INS)
		.replaceOne({ _id: `${input.matchId}|${input.teamName}` }, { ...input, _id: `${input.matchId}|${input.teamName}` } as unknown as CaptainCheckIn & { _id: string }, {
			upsert: true,
		});
	return input;
}

export async function listMatchReports(matchId?: string): Promise<TournamentMatchReport[]> {
	const filter = matchId ? { matchId } : {};
	const docs = await (await getDb()).collection<TournamentMatchReport & { _id: string }>(REPORTS).find(filter).sort({ createdAt: -1 }).toArray();
	return docs.map((doc) => withoutId(doc) as TournamentMatchReport);
}

export async function createMatchReport(input: Omit<TournamentMatchReport, "id" | "createdAt">) {
	const report: TournamentMatchReport = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
	await (await getDb()).collection<TournamentMatchReport & { _id: string }>(REPORTS).insertOne({ ...report, _id: report.id });
	return report;
}

export async function getFeedbackDashboard(): Promise<FeedbackDashboard> {
	const defaults: FeedbackDashboard = {
		id: "default",
		formUrl: "https://forms.gle/kX3fe3EmWX2MfaQJ6",
		responses: 0,
		updatedAt: new Date().toISOString(),
	};
	const doc = await (await getDb()).collection<FeedbackDashboard & { _id: string }>(FEEDBACK).findOne({ _id: "default" });
	return doc ? { ...defaults, ...(withoutId(doc) as FeedbackDashboard) } : defaults;
}

export async function updateFeedbackDashboard(patch: Partial<Omit<FeedbackDashboard, "id" | "updatedAt">> & { updatedBy?: string }) {
	const now = new Date().toISOString();
	await (await getDb())
		.collection<FeedbackDashboard & { _id: string }>(FEEDBACK)
		.updateOne({ _id: "default" }, { $set: { ...patch, id: "default", updatedAt: now } }, { upsert: true });
	return getFeedbackDashboard();
}
