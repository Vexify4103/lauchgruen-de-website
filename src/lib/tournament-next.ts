import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";
import { computeGroupStandings, resolvePlayoffMatches, type ResolvedPlayoffMatch } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { readTournamentState, type StoredTournamentMatch } from "@/lib/tournament-storage";
import { clearDraftStates, listDraftStates, type TournamentDraftState } from "@/lib/tournament-draft";
import { clearTournamentWheel, getTournamentWheelState, type TournamentWheelState } from "@/lib/tournament-wheel";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
import { getTournamentSettings, updateTournamentSettings } from "@/lib/tournament-settings";
import type { GroupMatch, TournamentTeam } from "@/lib/tournament-data";

type ArchivedPlayer = Pick<TournamentTeam["players"][number], "name" | "role" | "riotId" | "verified" | "opggUrl" | "dpmUrl">;
type ArchivedTeam = Omit<TournamentTeam, "captainRef" | "discordRoleId" | "players"> & { players: ArchivedPlayer[] };
type ArchivedDraft = Pick<TournamentDraftState, "matchId" | "updatedAt"> & {
	actions: Array<Pick<TournamentDraftState["actions"][number], "side" | "kind" | "champion" | "lockedAt">>;
};

export type TournamentArchiveSnapshot = {
	teams: ArchivedTeam[];
	groupMatches: GroupMatch[];
	matches: Record<string, Omit<StoredTournamentMatch, "adminNote">>;
	playoffs: ResolvedPlayoffMatch[];
	standings: ReturnType<typeof computeGroupStandings>;
	wheel: Omit<TournamentWheelState, "currentAssignment"> & {
		currentAssignment: Omit<NonNullable<TournamentWheelState["currentAssignment"]>, "spunBy"> | null;
	};
	drafts: ArchivedDraft[];
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
	await (await getDb()).collection<TournamentArchive & { _id: string }>(ARCHIVES).replaceOne({ _id: archive.id }, { ...archive, _id: archive.id } as unknown as TournamentArchive & { _id: string }, { upsert: true });
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

function publicMatch(match: StoredTournamentMatch): Omit<StoredTournamentMatch, "adminNote"> {
	const { adminNote: _adminNote, ...rest } = match;
	void _adminNote;
	return rest;
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

function publicDrafts(drafts: TournamentDraftState[]): ArchivedDraft[] {
	return drafts.map((draft) => ({
		matchId: draft.matchId,
		updatedAt: draft.updatedAt,
		actions: draft.actions.map(({ side, kind, champion, lockedAt }) => ({ side, kind, champion, lockedAt })),
	}));
}

function archiveRoleCleanupOperations(teams: TournamentTeam[]): DiscordOperation[] {
	const operations: DiscordOperation[] = [];
	const tournamentRoleId = process.env.DISCORD_TOURNAMENT_ROLE_ID?.trim();
	const captainRoleId = process.env.DISCORD_CAPTAINS_ROLE_ID?.trim();
	for (const team of teams) {
		for (const player of team.players) {
			if (!player.discordId) continue;
			if (tournamentRoleId) operations.push({ kind: "role", discordId: player.discordId, roleId: tournamentRoleId, enabled: false, label: `${player.name}: Turnierrolle entfernen` });
			if (team.discordRoleId) operations.push({ kind: "role", discordId: player.discordId, roleId: team.discordRoleId, enabled: false, label: `${player.name}: Teamrolle entfernen` });
		}
		if (captainRoleId && team.captainRef?.discordId) {
			operations.push({ kind: "role", discordId: team.captainRef.discordId, roleId: captainRoleId, enabled: false, label: `${team.name}: Captain-Rolle entfernen` });
		}
	}
	return operations;
}

export async function archiveAzTournamentAndPrepareUltimateBravery(input: {
	championTeam: string;
	finalistTeam?: string;
	note?: string;
	vodUrl?: string;
	highlightUrl?: string;
	createdBy?: string;
}) {
	const settings = await getTournamentSettings();
	if (settings.activeTournament.id !== "az-2026") throw new Error("Das aktive Turnier wurde bereits archiviert oder geändert.");

	const ctx = await getTournamentContext();
	const [state, wheel, drafts] = await Promise.all([readTournamentState(ctx.groupMatches), getTournamentWheelState(), listDraftStates()]);
	const playoffs = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
	const champion = ctx.teams.find((team) => team.name === input.championTeam);
	if (!champion) throw new Error("Das Gewinnerteam wurde im aktuellen Turnier nicht gefunden.");
	const final = playoffs.find((match) => match.id === "gf");
	const derivedFinalist = final?.teamAName === input.championTeam ? final.teamBName : final?.teamAName;
	const snapshot: TournamentArchiveSnapshot = {
		teams: ctx.teams.map(publicTeam),
		groupMatches: ctx.groupMatches,
		matches: Object.fromEntries(Object.entries(state.matches).map(([id, match]) => [id, publicMatch(match)])),
		playoffs,
		standings: computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches),
		wheel: publicWheel(wheel),
		drafts: publicDrafts(drafts),
	};
	const archive = await upsertTournamentArchive({
		id: "az-2026",
		title: "Kunterbuntes A-Z Turnier",
		season: "A-Z Turnier 2026",
		dateLabel: "19.–20.06.2026",
		format: "Gruppenphase + Double Elimination + A-Z Pools",
		championTeam: input.championTeam,
		finalistTeam: input.finalistTeam || derivedFinalist || undefined,
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
		db.collection<{ _id: string; teams?: Record<string, unknown> }>("bot_state").updateOne({ _id: "default" }, { $set: { teams: {} } }, { upsert: true }),
		clearDraftStates(),
		clearTournamentWheel(),
	]);
	await updateTournamentSettings({
		patch: {
			activeTournament: { id: "ultimate-bravery", name: "Ultimate Bravery", season: "Ultimate Bravery · Details folgen", mode: "teaser" },
			applicationsOpen: false,
			applicationDeadlineOverride: false,
			tournamentLive: false,
			draftEnabled: false,
		},
		updatedBy: input.createdBy,
	});
	const discordJob = await enqueueDiscordJob({ type: "archive-az-role-cleanup", title: "A-Z-Turnierrollen entfernen", operations: cleanupOperations, actorLabel: input.createdBy });
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
	await (await getDb()).collection<TournamentTemplate & { _id: string }>(TEMPLATES).replaceOne({ _id: template.id }, { ...template, _id: template.id } as unknown as TournamentTemplate & { _id: string }, { upsert: true });
	return template;
}

export async function getCaptainCheckIn(matchId: string, teamName: string): Promise<CaptainCheckIn | null> {
	const doc = await (await getDb()).collection<CaptainCheckIn & { _id: string }>(CHECK_INS).findOne({ _id: `${matchId}|${teamName}` });
	return doc ? (withoutId(doc) as CaptainCheckIn) : null;
}

export async function upsertCaptainCheckIn(input: CaptainCheckIn) {
	await (await getDb()).collection<CaptainCheckIn & { _id: string }>(CHECK_INS).replaceOne({ _id: `${input.matchId}|${input.teamName}` }, { ...input, _id: `${input.matchId}|${input.teamName}` } as unknown as CaptainCheckIn & { _id: string }, { upsert: true });
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
	await (await getDb()).collection<FeedbackDashboard & { _id: string }>(FEEDBACK).updateOne({ _id: "default" }, { $set: { ...patch, id: "default", updatedAt: now } }, { upsert: true });
	return getFeedbackDashboard();
}
