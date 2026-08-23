"use client";

import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerRole, RosterApplicant, RosterSnapshot, RosterTeam } from "@/lib/roster";
import { snakeFillAssignments, type BalanceResult } from "@/lib/snake-fill";
import { formatRankScore, parseRank } from "@/lib/rank-score";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ThemedNumberInput } from "@/components/ThemedNumberInput";
import { GroupAssignmentBoard } from "./GroupAssignmentBoard";

type SortMode = "rank-desc" | "rank-asc" | "role-available";

const SORT_OPTIONS: Array<{ value: SortMode; label: string; title: string }> = [
	{ value: "rank-desc", label: "Elo ↓", title: "Höchster Rang zuerst" },
	{ value: "rank-asc", label: "Elo ↑", title: "Niedrigster Rang zuerst" },
	{
		value: "role-available",
		label: "Rolle frei",
		title: "Wunschrolle ist in mindestens einem Team noch offen",
	},
];

function normalizeRoleName(raw: string): PlayerRole | null {
	const lower = raw.trim().toLowerCase();
	for (const role of ALL_ROLES) {
		if (role.toLowerCase() === lower) return role;
	}
	if (lower === "adc" || lower === "bot lane" || lower === "botlane") return "Bot";
	if (lower === "jg" || lower === "jng" || lower === "jgl") return "Jungle";
	if (lower === "supp") return "Support";
	return null;
}

const ROLES: PlayerRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];
const ALL_ROLES: PlayerRole[] = [...ROLES, "Fill", "Sub"];

function opggUrl(riotId: string): string {
	return `https://www.op.gg/summoners/euw/${encodeURIComponent(riotId.replace("#", "-"))}`;
}

type Assignment = {
	/** teamKey OR "" if unassigned */
	teamKey: string;
	role: PlayerRole | null;
};

type State = {
	/** discordId → assignment */
	assignments: Map<string, Assignment>;
	/** teamKey → captain discordId | null */
	captains: Map<string, string | null>;
	/** Admin-entered substitutes without completed account verification. */
	manualPlayers: Map<string, RosterApplicant>;
};

type TeamMutationResponse = {
	key: string;
	name: string;
	group?: string;
	seed?: number | null;
	version?: number;
	warnings?: string[];
	discordJob?: DiscordJobStatus | null;
};

type DiscordJobStatus = {
	id: string;
	title: string;
	status: "queued" | "running" | "completed" | "failed";
	total: number;
	completed: number;
	failed: number;
	current?: string;
	warnings: string[];
};

function initialState(snapshot: RosterSnapshot): State {
	const assignments = new Map<string, Assignment>();
	for (const team of snapshot.teams) {
		for (const player of team.players) {
			if (!player.discordId) continue;
			assignments.set(player.discordId, {
				teamKey: team.key,
				role: player.role,
			});
		}
	}
	const captains = new Map<string, string | null>();
	for (const team of snapshot.teams) {
		captains.set(team.key, team.captainDiscordId);
	}
	const manualPlayers = new Map(snapshot.applicants.filter((applicant) => applicant.source === "manual").map((applicant) => [applicant.discordId, applicant]));
	return { assignments, captains, manualPlayers };
}

function serializeRosterState(state: State) {
	return JSON.stringify({
		assignments: [...state.assignments.entries()].sort(([a], [b]) => a.localeCompare(b)),
		captains: [...state.captains.entries()].sort(([a], [b]) => a.localeCompare(b)),
		manualPlayers: [...state.manualPlayers.entries()]
			.map(([discordId, player]) => [
				discordId,
				{
					discordUsername: player.discordUsername ?? "",
					displayName: player.displayName,
					riotId: player.riotId,
				},
			])
			.sort(([a], [b]) => String(a).localeCompare(String(b))),
	});
}

function teamFromMutationResponse(response: TeamMutationResponse): RosterTeam {
	return {
		key: response.key,
		name: response.name,
		group: response.group,
		seed: response.seed ?? undefined,
		captainDiscordId: null,
		players: [],
	};
}

export function RosterBuilder({
	snapshot: initialSnapshot,
	dayOneFormat,
	groupCount,
	plannedTeamCount,
}: {
	snapshot: RosterSnapshot;
	initialVersion: number;
	dayOneFormat: "groups" | "swiss" | "undecided";
	groupCount: number;
	plannedTeamCount: number;
}) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [snapshot, setSnapshot] = useState<RosterSnapshot>(initialSnapshot);
	const [state, setState] = useState<State>(() => initialState(snapshot));
	const [savedRosterState, setSavedRosterState] = useState(() => serializeRosterState(initialState(snapshot)));
	const [picker, setPicker] = useState<null | {
		teamKey: string;
		role: PlayerRole;
	}>(null);
	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [discordJob, setDiscordJob] = useState<DiscordJobStatus | null>(null);
	const [message, setMessage] = useState<null | {
		tone: "ok" | "error";
		text: string;
	}>(null);
	const [autoConfirm, setAutoConfirm] = useState(false);
	const [autoRunning, setAutoRunning] = useState(false);
	const [splitThreshold, setSplitThreshold] = useState(() => {
		if (typeof window === "undefined") return 22;
		const stored = localStorage.getItem("roster-balance-threshold");
		const parsed = stored ? Number(stored) : 22;
		return Math.min(35, Math.max(10, parsed || 22));
	});

	useEffect(() => {
		localStorage.setItem("roster-balance-threshold", String(splitThreshold));
	}, [splitThreshold]);

	useEffect(() => {
		const modeChanged = snapshot.testModeActive !== initialSnapshot.testModeActive;
		const frame = window.requestAnimationFrame(() => {
			setSnapshot(initialSnapshot);
			if (modeChanged) {
				const nextState = initialState(initialSnapshot);
				setState(nextState);
				setSavedRosterState(serializeRosterState(nextState));
			}
		});
		return () => window.cancelAnimationFrame(frame);
	}, [initialSnapshot, snapshot.testModeActive]);

	useEffect(() => {
		if (!discordJob || discordJob.status === "completed" || discordJob.status === "failed") return;
		let cancelled = false;
		const timer = window.setInterval(async () => {
			const response = await fetch(`/api/tournament/discord-jobs/${discordJob.id}`);
			const json = (await response.json().catch(() => null)) as { job?: DiscordJobStatus } | null;
			if (!cancelled && json?.job) setDiscordJob(json.job);
		}, 1200);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [discordJob]);
	const [balanceResult, setBalanceResult] = useState<BalanceResult | null>(null);
	const [editingRankId, setEditingRankId] = useState<string | null>(null);
	const [editingRankTier, setEditingRankTier] = useState("");
	const [editingRankDivision, setEditingRankDivision] = useState("");
	const [editingRankLp, setEditingRankLp] = useState("");
	const [seeding, setSeeding] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [testDataAction, setTestDataAction] = useState<"seed" | "clear" | null>(null);
	const [pulseId, setPulseId] = useState<string | null>(null);
	const [sortMode, setSortMode] = useState<SortMode>("rank-desc");
	const [createOpen, setCreateOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const [newTeamName, setNewTeamName] = useState("");
	const [editTeamTarget, setEditTeamTarget] = useState<RosterTeam | null>(null);
	const [editingTeam, setEditingTeam] = useState(false);
	const [editTeamName, setEditTeamName] = useState("");
	const [deleteTeamTarget, setDeleteTeamTarget] = useState<RosterTeam | null>(null);
	const [deletingTeam, setDeletingTeam] = useState(false);
	const [manualSubOpen, setManualSubOpen] = useState(false);
	const [manualSubDiscordId, setManualSubDiscordId] = useState("");
	const [manualSubDiscordUsername, setManualSubDiscordUsername] = useState("");
	const [manualSubDisplayName, setManualSubDisplayName] = useState("");
	const [manualSubRiotId, setManualSubRiotId] = useState("");
	const [manualSubTeamKey, setManualSubTeamKey] = useState("");
	const usesGroups = dayOneFormat === "groups";
	const currentRosterState = useMemo(() => serializeRosterState(state), [state]);
	const rosterDirty = currentRosterState !== savedRosterState;
	const createTeamDirty = Boolean(createOpen && newTeamName.trim());
	const editTeamDirty = Boolean(editTeamTarget && editTeamName !== editTeamTarget.name);

	// Auto-dismiss "ok" toasts so they don't sit stuck after the next router
	// refresh. Errors stay until manually replaced.
	useEffect(() => {
		if (message?.tone !== "ok") return;
		const t = setTimeout(() => setMessage(null), 4000);
		return () => clearTimeout(t);
	}, [message]);

	const applicantById = useMemo(() => {
		const applicants = new Map(snapshot.applicants.map((a) => [a.discordId, a]));
		for (const [discordId, player] of state.manualPlayers) {
			applicants.set(discordId, player);
		}
		return applicants;
	}, [snapshot.applicants, state.manualPlayers]);

	const allApplicants = useMemo(() => [...applicantById.values()], [applicantById]);

	const teamByKey = useMemo(() => new Map(snapshot.teams.map((t) => [t.key, t])), [snapshot.teams]);

	const playersByTeamRole = useMemo(() => {
		const map = new Map<string, Map<PlayerRole, string[]>>();
		for (const team of snapshot.teams) {
			map.set(team.key, new Map());
		}
		for (const [discordId, assignment] of state.assignments) {
			if (!assignment.teamKey) continue;
			const teamMap = map.get(assignment.teamKey);
			if (!teamMap) continue;
			const role = assignment.role ?? "Fill";
			if (!teamMap.has(role)) teamMap.set(role, []);
			teamMap.get(role)!.push(discordId);
		}
		return map;
	}, [snapshot.teams, state.assignments]);

	/** Roles that still have at least one open slot somewhere across all teams. */
	const openRolesAnywhere = useMemo(() => {
		const open = new Set<PlayerRole>();
		for (const team of snapshot.teams) {
			const filled = playersByTeamRole.get(team.key) ?? new Map();
			for (const role of ROLES) {
				if ((filled.get(role) ?? []).length === 0) open.add(role);
			}
		}
		return open;
	}, [snapshot.teams, playersByTeamRole]);

	const unassigned = useMemo(() => {
		const base = allApplicants.filter((a) => !state.assignments.has(a.discordId) || state.assignments.get(a.discordId)?.teamKey === "");
		const sorted = [...base];
		if (sortMode === "rank-desc") {
			sorted.sort((a, b) => parseRank(b.manualRankOverride || b.currentRank) - parseRank(a.manualRankOverride || a.currentRank));
		} else if (sortMode === "rank-asc") {
			sorted.sort((a, b) => parseRank(a.manualRankOverride || a.currentRank) - parseRank(b.manualRankOverride || b.currentRank));
		} else {
			// role-available: the earliest still-open preference wins.
			sorted.sort((a, b) => {
				const aPriority = a.preferredRoles.findIndex((r) => {
					const role = normalizeRoleName(r);
					return role !== null && openRolesAnywhere.has(role);
				});
				const bPriority = b.preferredRoles.findIndex((r) => {
					const role = normalizeRoleName(r);
					return role !== null && openRolesAnywhere.has(role);
				});
				if (aPriority !== bPriority) return (aPriority < 0 ? Number.MAX_SAFE_INTEGER : aPriority) - (bPriority < 0 ? Number.MAX_SAFE_INTEGER : bPriority);
				return parseRank(b.manualRankOverride || b.currentRank) - parseRank(a.manualRankOverride || a.currentRank);
			});
		}
		return sorted;
	}, [allApplicants, state.assignments, sortMode, openRolesAnywhere]);

	const preferenceGroups = useMemo(() => {
		const grouped = new Map<string, RosterApplicant[]>();
		for (const applicant of snapshot.applicants) {
			if (!applicant.preferenceGroupCode) continue;
			const members = grouped.get(applicant.preferenceGroupCode) ?? [];
			members.push(applicant);
			grouped.set(applicant.preferenceGroupCode, members);
		}
		return [...grouped.entries()].map(([code, members]) => ({ code, members })).sort((a, b) => a.code.localeCompare(b.code));
	}, [snapshot.applicants]);

	const preferenceGroupSummary = useMemo(() => {
		const rows = preferenceGroups.map(({ code, members }) => {
			const teamCounts = new Map<string, number>();
			let unassigned = 0;
			for (const member of members) {
				const teamKey = state.assignments.get(member.discordId)?.teamKey;
				if (!teamKey) {
					unassigned += 1;
					continue;
				}
				teamCounts.set(teamKey, (teamCounts.get(teamKey) ?? 0) + 1);
			}
			const largestTogether = Math.max(0, ...teamCounts.values());
			const assigned = members.length - unassigned;
			const status = assigned === 0 ? "open" : teamCounts.size === 1 && unassigned === 0 ? "together" : largestTogether >= 2 ? "partial" : "split";
			return {
				code,
				total: members.length,
				assigned,
				unassigned,
				largestTogether,
				status,
			};
		});
		const count = (status: (typeof rows)[number]["status"]) => rows.filter((row) => row.status === status).length;
		const membersTogether = rows.reduce((total, row) => total + row.largestTogether, 0);
		const totalMembers = rows.reduce((total, row) => total + row.total, 0);
		return {
			rows,
			together: count("together"),
			partial: count("partial"),
			split: count("split"),
			open: count("open"),
			membersTogether,
			totalMembers,
		};
	}, [preferenceGroups, state.assignments]);

	const applicantEloSummary = useMemo(() => {
		const eligibleApplicants = allApplicants.filter((applicant) => applicant.verified);
		const scores = eligibleApplicants.map((applicant) => parseRank(applicant.manualRankOverride || applicant.currentRank)).filter((score) => score > 0);
		return {
			average: scores.length > 0 ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null,
			rated: scores.length,
			total: eligibleApplicants.length,
		};
	}, [allApplicants]);

	const assignPlayer = useCallback((discordId: string, teamKey: string, role: PlayerRole) => {
		setState((prev) => {
			const next = new Map(prev.assignments);
			next.set(discordId, { teamKey, role });
			return { ...prev, assignments: next };
		});
	}, []);

	const unassignPlayer = useCallback((discordId: string) => {
		setState((prev) => {
			const next = new Map(prev.assignments);
			next.set(discordId, { teamKey: "", role: null });
			const captains = new Map(prev.captains);
			for (const [tk, cid] of captains) {
				if (cid === discordId) captains.set(tk, null);
			}
			return { ...prev, assignments: next, captains };
		});
	}, []);

	const setRole = useCallback((discordId: string, role: PlayerRole) => {
		setState((prev) => {
			const current = prev.assignments.get(discordId);
			if (!current || !current.teamKey) return prev;
			const next = new Map(prev.assignments);
			next.set(discordId, { ...current, role });
			return { ...prev, assignments: next };
		});
	}, []);

	async function saveRankOverride(applicant: RosterApplicant, override: string | null) {
		const appId = applicant.puuid + "|" + applicant.discordId;
		const versionRes = await fetch(`/api/tournament/applications?versionFor=${encodeURIComponent(appId)}`);
		const versionData = await versionRes.json().catch(() => null);
		const appVersion: number = versionData?.version ?? 0;

		const response = await fetch("/api/tournament/applications", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: appId,
				expectedVersion: appVersion,
				manualRankOverride: override,
			}),
		});
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			setMessage({
				tone: "error",
				text: json?.message ?? "Fehler beim Speichern der Rang-Überschreibung.",
			});
			return;
		}
		setSnapshot((prev) => ({
			...prev,
			applicants: prev.applicants.map((a) => (a.discordId === applicant.discordId ? { ...a, manualRankOverride: override } : a)),
		}));
		setMessage({
			tone: "ok",
			text: override ? `Rang-Überschreibung für ${applicant.displayName} gesetzt: ${override}` : `Rang-Überschreibung für ${applicant.displayName} entfernt.`,
		});
	}

	const toggleCaptain = useCallback(
		(teamKey: string, discordId: string) => {
			if (state.manualPlayers.has(discordId)) {
				setMessage({
					tone: "error",
					text: "Nicht verifizierte Ersatzspieler können nicht als Captain eingetragen werden.",
				});
				return;
			}
			setState((prev) => {
				const captains = new Map(prev.captains);
				captains.set(teamKey, captains.get(teamKey) === discordId ? null : discordId);
				return { ...prev, captains };
			});
		},
		[state.manualPlayers]
	);

	const openManualSubstituteDialog = useCallback(
		(teamKey = "") => {
			setManualSubTeamKey(teamKey || snapshot.teams[0]?.key || "");
			setManualSubDiscordId("");
			setManualSubDiscordUsername("");
			setManualSubDisplayName("");
			setManualSubRiotId("");
			setManualSubOpen(true);
		},
		[snapshot.teams]
	);

	const handleAssignClick = useCallback((teamKey: string, role: PlayerRole) => setPicker({ teamKey, role }), []);

	const handleDeleteTeam = useCallback(
		(teamKey: string) => {
			const t = snapshot.teams.find((tm) => tm.key === teamKey);
			if (t) setDeleteTeamTarget(t);
		},
		[snapshot.teams]
	);

	function addManualSubstitute() {
		const discordId = manualSubDiscordId.trim();
		const discordUsername = manualSubDiscordUsername.replace(/^@+/, "").trim();
		const displayName = manualSubDisplayName.trim();
		const riotId = manualSubRiotId.trim();
		const teamKey = manualSubTeamKey;

		if (!/^\d{17,20}$/.test(discordId)) {
			setMessage({
				tone: "error",
				text: "Bitte eine gültige numerische Discord-ID eingeben.",
			});
			return;
		}
		if (!discordUsername) {
			setMessage({
				tone: "error",
				text: "Bitte den Discord-Benutzernamen eingeben.",
			});
			return;
		}
		if (!displayName) {
			setMessage({ tone: "error", text: "Bitte den gewünschten Discord-Nickname eingeben." });
			return;
		}
		if (!/^.+#[^#]+$/.test(riotId)) {
			setMessage({
				tone: "error",
				text: "Die Riot-ID muss im Format Name#Tag angegeben werden.",
			});
			return;
		}
		if (!teamByKey.has(teamKey)) {
			setMessage({ tone: "error", text: "Bitte ein Zielteam auswählen." });
			return;
		}
		const existing = applicantById.get(discordId);
		if (existing && existing.source !== "manual") {
			setMessage({
				tone: "error",
				text: "Diese Discord-ID gehört bereits zu einem verifizierten Bewerber.",
			});
			return;
		}
		const duplicateRiotId = allApplicants.find(
			(applicant) => applicant.discordId !== discordId && applicant.riotId.toLocaleLowerCase("de-DE") === riotId.toLocaleLowerCase("de-DE")
		);
		if (duplicateRiotId) {
			setMessage({
				tone: "error",
				text: `Diese Riot-ID ist bereits ${duplicateRiotId.displayName} zugeordnet.`,
			});
			return;
		}

		const now = new Date().toISOString();
		const manualPlayer: RosterApplicant = {
			discordId,
			discordHandle: `@${discordUsername}`,
			discordUsername,
			displayName,
			riotId,
			puuid: `manual-${discordId}`,
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

		setState((previous) => {
			const assignments = new Map(previous.assignments);
			assignments.set(discordId, { teamKey, role: "Sub" });
			const manualPlayers = new Map(previous.manualPlayers);
			manualPlayers.set(discordId, manualPlayer);
			return { ...previous, assignments, manualPlayers };
		});
		setManualSubOpen(false);
		setMessage({
			tone: "ok",
			text: `${displayName} wurde als nicht verifizierter Ersatzspieler vorgemerkt. Bitte den Entwurf speichern und später bewusst veröffentlichen.`,
		});
	}

	async function runAutoBalance() {
		setAutoConfirm(false);
		setAutoRunning(true);
		setMessage(null);
		setBalanceResult(null);
		const verifiedApplicants = snapshot.applicants.filter((applicant) => applicant.verified);
		const result = snakeFillAssignments(verifiedApplicants, snapshot.teams, {
			splitThreshold: splitThreshold / 100,
		});

		// Clear everything first.
		setState((prev) => ({
			...prev,
			assignments: new Map(allApplicants.map((a) => [a.discordId, { teamKey: "", role: null }])),
			captains: new Map([...prev.captains].map(([k]) => [k, null])),
		}));
		await new Promise((r) => setTimeout(r, 220));

		// Apply assignments one at a time with a small delay for visual rhythm.
		for (const a of result.assignments) {
			assignPlayer(a.discordId, a.teamKey, a.role);
			setPulseId(a.discordId);
			await new Promise((r) => setTimeout(r, 30));
		}
		setPulseId(null);
		setAutoRunning(false);
		setBalanceResult(result);

		const splitCount = result.splitGroups.length;
		const tooStrong = result.splitGroups.filter((g) => g.reason === "too_strong").length;
		const tooWeak = result.splitGroups.filter((g) => g.reason === "too_weak").length;

		setMessage({
			tone: "ok",
			text:
				`Auto-Balance hat ${result.assignments.length} Spieler auf ${snapshot.teams.length} Team(s) verteilt.` +
				(splitCount > 0
					? ` ${splitCount} Wunschgruppe(n) aufgeteilt` + (tooStrong > 0 ? ` (${tooStrong} zu stark)` : "") + (tooWeak > 0 ? ` (${tooWeak} zu schwach)` : "") + "."
					: " Wunschgruppen wurden zusammengehalten.") +
				(result.imputedApplicants > 0 ? ` ${result.imputedApplicants} Spieler ohne verwertbaren Rang wurden neutral mit dem Bewerber-Median bewertet.` : "") +
				(result.highEloPreferredAssignments.length > 0
					? ` Achtung: ${result.highEloPreferredAssignments.length} Master+-Spieler wurden auf einer Main- oder Wunschrolle eingeplant.`
					: "") +
				" Prüfen und speichern, wenn alles passt.",
		});
	}

	const createTeam = useCallback(async (): Promise<boolean> => {
		const name = newTeamName.trim();
		if (!name) {
			setMessage({
				tone: "error",
				text: "Bitte einen Teamnamen eingeben.",
			});
			return false;
		}
		setCreating(true);
		setMessage(null);
		const response = await fetch("/api/tournament/teams", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name,
			}),
		});
		setCreating(false);
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage({
				tone: "error",
				text: json?.message ?? "Team konnte nicht erstellt werden.",
			});
			return false;
		}
		if (json?.key && json?.name) {
			setSnapshot((current) => ({
				...current,
				teams: [...current.teams, teamFromMutationResponse(json as TeamMutationResponse)],
			}));
			setState((current) => ({
				...current,
				captains: new Map(current.captains).set(json.key, null),
			}));
		}
		setNewTeamName("");
		setCreateOpen(false);
		const warnings = (json?.warnings as string[] | undefined) ?? [];
		if (json?.discordJob) setDiscordJob(json.discordJob as DiscordJobStatus);
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text: [`Team "${json.name}" erstellt.`, json?.discordJob ? "Discord-Rolle und Channels werden im Hintergrund erstellt." : "", ...warnings].filter(Boolean).join(" "),
		});
		router.refresh();
		return true;
	}, [newTeamName, router, showConflict]);

	const openEditTeam = useCallback((team: RosterTeam) => {
		setEditTeamTarget(team);
		setEditTeamName(team.name);
	}, []);

	const handleEditTeam = useCallback(
		(teamKey: string) => {
			const t = snapshot.teams.find((tm) => tm.key === teamKey);
			if (t) openEditTeam(t);
		},
		[snapshot.teams, openEditTeam]
	);

	const updateTeam = useCallback(async (): Promise<boolean> => {
		if (!editTeamTarget) return true;
		const name = editTeamName.trim();
		if (!name) {
			setMessage({
				tone: "error",
				text: "Bitte einen Teamnamen eingeben.",
			});
			return false;
		}
		setEditingTeam(true);
		setMessage(null);
		const response = await fetch("/api/tournament/teams", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				key: editTeamTarget.key,
				name,
			}),
		});
		setEditingTeam(false);
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage({
				tone: "error",
				text: json?.message ?? "Team konnte nicht aktualisiert werden.",
			});
			return false;
		}
		const oldKey = editTeamTarget.key;
		if (json?.key && json?.name) {
			const nextKey = String(json.key);
			setSnapshot((current) => ({
				...current,
				teams: current.teams.map((team) =>
					team.key === oldKey
						? {
								...team,
								key: nextKey,
								name: String(json.name),
							}
						: team
				),
			}));
			if (nextKey !== oldKey) {
				setState((current) => {
					const assignments = new Map(current.assignments);
					for (const [discordId, assignment] of assignments) {
						if (assignment.teamKey === oldKey) {
							assignments.set(discordId, { ...assignment, teamKey: nextKey });
						}
					}
					const captains = new Map(current.captains);
					const captain = captains.get(oldKey) ?? null;
					captains.delete(oldKey);
					captains.set(nextKey, captain);
					return { ...current, assignments, captains };
				});
			}
		}
		setEditTeamTarget(null);
		const updateWarnings = (json?.warnings as string[] | undefined) ?? [];
		if (json?.discordJob) setDiscordJob(json.discordJob as DiscordJobStatus);
		setMessage({
			tone: updateWarnings.length > 0 ? "error" : "ok",
			text: [`Team "${json.name}" aktualisiert.`, json?.discordJob ? "Discord-Ressourcen werden im Hintergrund umbenannt." : "", ...updateWarnings].filter(Boolean).join(" "),
		});
		router.refresh();
		return true;
	}, [editTeamTarget, editTeamName, router, showConflict]);

	async function performDeleteTeam() {
		if (!deleteTeamTarget) return;
		const team = deleteTeamTarget;
		setDeleteTeamTarget(null);
		setDeletingTeam(true);
		setMessage(null);
		const response = await fetch(`/api/tournament/teams?key=${encodeURIComponent(team.key)}`, { method: "DELETE" });
		setDeletingTeam(false);
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return;
			}
			setMessage({
				tone: "error",
				text: json?.message ?? "Team konnte nicht gelöscht werden.",
			});
			return;
		}
		// Locally drop any assignments / captain that referenced this team — otherwise
		// they'd silently linger in component state until the next manual refresh.
		setState((prev) => {
			const nextAssignments = new Map(prev.assignments);
			for (const [discordId, assignment] of prev.assignments) {
				if (assignment.teamKey === team.key) {
					nextAssignments.set(discordId, { teamKey: "", role: null });
				}
			}
			const nextCaptains = new Map(prev.captains);
			nextCaptains.delete(team.key);
			return { ...prev, assignments: nextAssignments, captains: nextCaptains };
		});
		setSnapshot((current) => ({
			...current,
			teams: current.teams.filter((entry) => entry.key !== team.key),
		}));
		const warnings = (json?.warnings as string[] | undefined) ?? [];
		if (json?.discordJob) setDiscordJob(json.discordJob as DiscordJobStatus);
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text: [`Team "${team.name}" gelöscht.`, json?.discordJob ? "Discord-Rolle und Channels werden im Hintergrund entfernt." : "", ...warnings].filter(Boolean).join(" "),
		});
		router.refresh();
	}

	async function seedTestData() {
		setTestDataAction(null);
		setSeeding(true);
		setMessage(null);
		const response = await fetch("/api/tournament/test-data", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ count: 40, confirmation: "TESTDATEN ANLEGEN" }),
		});
		setSeeding(false);
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return;
			}
			setMessage({
				tone: "error",
				text: json?.message ?? "Test-Daten konnten nicht angelegt werden.",
			});
			return;
		}
		window.location.reload();
	}

	async function clearTestData() {
		setTestDataAction(null);
		setClearing(true);
		setMessage(null);
		const response = await fetch("/api/tournament/test-data", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ confirmation: "TESTDATEN LÖSCHEN" }),
		});
		setClearing(false);
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return;
			}
			setMessage({
				tone: "error",
				text: json?.message ?? "Test-Daten konnten nicht gelöscht werden.",
			});
			return;
		}
		window.location.reload();
	}

	const save = useCallback(async (): Promise<boolean> => {
		const stateBeingSaved = currentRosterState;
		setSaving(true);
		setMessage(null);
		const teamPlayers: Record<string, Array<{ discordId: string; role: PlayerRole | null }>> = {};
		for (const team of snapshot.teams) {
			teamPlayers[team.key] = [];
		}
		for (const [discordId, assignment] of state.assignments) {
			if (!assignment.teamKey) continue;
			teamPlayers[assignment.teamKey]?.push({
				discordId,
				role: assignment.role,
			});
		}
		const captains: Record<string, string | null> = {};
		for (const [teamKey, captainId] of state.captains) {
			captains[teamKey] = captainId;
		}
		const manualPlayers = Object.fromEntries(
			[...state.manualPlayers.entries()].map(([discordId, player]) => [
				discordId,
				{
					discordUsername: player.discordUsername ?? player.discordHandle,
					displayName: player.displayName,
					riotId: player.riotId,
				},
			])
		);
		const response = await fetch("/api/tournament/roster", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				teamPlayers,
				captains,
				manualPlayers,
			}),
		});
		setSaving(false);
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			const errs = (json?.errors as string[] | undefined) ?? [json?.message ?? "Save failed."];
			setMessage({ tone: "error", text: errs.join(" · ") });
			return false;
		}
		setSavedRosterState(stateBeingSaved);
		setSnapshot((current) => ({
			...current,
			publication: {
				...current.publication,
				draftUpdatedAt: new Date().toISOString(),
				hasUnpublishedChanges: !current.testModeActive,
			},
		}));
		const warnings = (json?.warnings as string[] | undefined) ?? [];
		setDiscordJob(null);
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text:
				`Privater Roster-Entwurf gespeichert · ${json.applied} Spieler in ${json.teamsUpdated} Team(s). Noch nicht veröffentlicht.` +
				(warnings.length > 0 ? ` Hinweis: ${warnings.join(" · ")}` : ""),
		});
		return true;
	}, [currentRosterState, state, snapshot.teams, showConflict, setSavedRosterState]);

	const publish = useCallback(
		async (repairDiscordRoles = false) => {
			if (rosterDirty) {
				setMessage({ tone: "error", text: "Speichere deine Roster-Änderungen zuerst, bevor du veröffentlichst." });
				return;
			}
			setPublishing(true);
			setMessage(null);
			const response = await fetch("/api/tournament/roster/publish", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ repairDiscordRoles }),
			});
			const json = await response.json().catch(() => null);
			setPublishing(false);
			if (!response.ok) {
				setMessage({ tone: "error", text: json?.message ?? "Roster konnte nicht veröffentlicht werden." });
				return;
			}
			const discordJobId = typeof json?.discordJobId === "string" ? json.discordJobId : null;
			if (discordJobId) {
				setDiscordJob({
					id: discordJobId,
					title: repairDiscordRoles ? "Discord-Rollen reparieren" : "Roster veröffentlichen",
					status: "queued",
					total: 0,
					completed: 0,
					failed: 0,
					warnings: [],
				});
			}
			setSnapshot((current) => ({
				...current,
				publication: {
					publishedAt: json?.publishedAt ?? current.publication.publishedAt,
					draftUpdatedAt: null,
					hasUnpublishedChanges: false,
				},
			}));
			setMessage({
				tone: (json?.warnings?.length ?? 0) > 0 ? "error" : "ok",
				text: repairDiscordRoles
					? discordJobId
						? "Die Reparatur der veröffentlichten Discord-Rollen wurde eingeplant."
						: "Alle veröffentlichten Discord-Rollen waren bereits korrekt."
					: json?.published
						? `Roster veröffentlicht · ${json.players} Spieler · ${json.dmQueued} Discord-DMs eingeplant${json.dmOptedOut ? ` · ${json.dmOptedOut} abgewählt` : ""}.`
						: "Seit der letzten Veröffentlichung gibt es keine Änderungen.",
			});
			router.refresh();
		},
		[rosterDirty, router]
	);

	useUnsavedChanges({
		dirty: rosterDirty,
		label: "Roster-Zuweisungen",
		save,
	});
	useUnsavedChanges({
		dirty: createTeamDirty,
		label: "Neues Team",
		save: createTeam,
	});
	useUnsavedChanges({
		dirty: editTeamDirty,
		label: `Team: ${editTeamTarget?.name ?? ""}`,
		save: updateTeam,
	});

	return (
		<div className="grid gap-5 xl:grid-cols-[23rem_minmax(0,1fr)]">
			{snapshot.testModeActive ? (
				<div className="rounded-[1.6rem] border border-amber-200/28 bg-gradient-to-r from-amber-200/12 via-lime-200/[0.08] to-cyan-200/[0.06] px-5 py-4 shadow-xl shadow-amber-300/10 xl:col-span-2">
					<div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/70">Temporärer Testmodus aktiv</div>
					<p className="mt-1 text-sm font-bold leading-6 text-amber-50/86">
						Du arbeitest gerade mit acht vollständigen Dummy-Teams. Roster-Saves verändern nur die Testdaten und lösen keine Discord-Synchronisation aus. Mit „Testmodus
						beenden“ wird der zuvor gesicherte echte Roster exakt wiederhergestellt.
					</p>
				</div>
			) : null}
			<aside className="flex flex-col overflow-hidden rounded-[2rem] border border-cyan-200/12 bg-[#08150f]/92 shadow-2xl shadow-black/24 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start">
				<div className="border-b border-white/8 bg-gradient-to-br from-cyan-300/[0.07] via-transparent to-lime-200/[0.04] p-5">
					<div className="flex items-start justify-between gap-3">
						<div>
							<div className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-100/44">Spieler-Pool</div>
							<h2 className="mt-1 text-xl font-black text-emerald-50">Nicht zugewiesen</h2>
						</div>
						<div className="grid size-10 place-items-center rounded-xl border border-cyan-200/16 bg-cyan-300/[0.08] font-mono text-sm font-black text-cyan-50">
							{unassigned.length}
						</div>
					</div>
				</div>
				<div
					className="mx-4 mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-xl border border-white/8 bg-black/22 px-3 py-2.5"
					title={`Interner Vergleichswert: ${applicantEloSummary.average?.toLocaleString("de-DE") ?? "keine Wertung"}`}
				>
					<div className="row-span-2 text-lg font-black text-cyan-50">{formatRankScore(applicantEloSummary.average)}</div>
					<div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/58">Bewerber Ø Rang</div>
					<div className="text-[9px] font-bold text-cyan-100/38">
						{applicantEloSummary.rated}/{applicantEloSummary.total} gewertet
					</div>
				</div>
				<div className="mx-4 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/8 bg-black/20 p-1">
					{SORT_OPTIONS.map((opt) => {
						const active = sortMode === opt.value;
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() => setSortMode(opt.value)}
								title={opt.title}
								className={`rounded-lg border px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.13em] transition ${
									active
										? "border-lime-200/40 bg-lime-200/14 text-lime-50"
										: "border-white/10 bg-black/24 text-emerald-100/60 hover:border-lime-200/24 hover:text-lime-100"
								}`}
							>
								{opt.label}
							</button>
						);
					})}
				</div>
				<div className="themed-scrollbar mx-2 mb-2 mt-3 grid min-h-0 flex-1 gap-2 overflow-y-auto px-2 pb-2">
					{unassigned.length === 0 ? (
						<div className="rounded-xl border border-white/8 bg-black/24 p-3 text-xs text-emerald-100/52">Alle verfügbaren Spieler sind zugewiesen.</div>
					) : (
						unassigned.map((a) => (
							<ApplicantCard
								key={a.discordId}
								applicant={a}
								compact
								isEditing={editingRankId === a.discordId}
								editingTier={editingRankTier}
								editingDivision={editingRankDivision}
								editingLp={editingRankLp}
								onStartEdit={() => {
									setEditingRankId(a.discordId);
									const override = a.manualRankOverride ?? "";
									if (!override || override === "Unranked") {
										setEditingRankTier("");
										setEditingRankDivision("");
										setEditingRankLp("");
									} else {
										const apexMatch = override.match(/^(Master|Grandmaster|Challenger)\s*(?:\((\d+)\s*LP\))?/i);
										if (apexMatch) {
											setEditingRankTier(apexMatch[1]);
											setEditingRankDivision("");
											setEditingRankLp(apexMatch[2] ?? "");
										} else {
											const divMatch = override.match(/^(\w+)\s+(IV|III|II|I)/i);
											if (divMatch) {
												setEditingRankTier(divMatch[1]);
												setEditingRankDivision(divMatch[2]);
												setEditingRankLp("");
											} else {
												setEditingRankTier(override);
												setEditingRankDivision("");
												setEditingRankLp("");
											}
										}
									}
								}}
								onTierChange={(tier) => {
									setEditingRankTier(tier);
								}}
								onDivisionChange={(division) => {
									setEditingRankDivision(division);
								}}
								onLpChange={(lp) => {
									setEditingRankLp(lp);
								}}
								onSaveRank={(rankStr) => {
									setEditingRankId(null);
									saveRankOverride(a, rankStr);
								}}
							/>
						))
					)}
				</div>
			</aside>

			<main className="grid min-w-0 content-start gap-5">
				<section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.04] shadow-xl shadow-black/20">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
						<div>
							<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">Roster-Steuerung</div>
							<div className="mt-1 text-[10px] font-bold text-emerald-100/42">
								{snapshot.teams.length} Teams · {allApplicants.length} Spieler verfügbar
							</div>
						</div>
						<div className="flex flex-wrap items-center justify-end gap-2">
							{message ? (
								<div
									className={`rounded-xl border px-3 py-1.5 text-xs ${
										message.tone === "ok" ? "border-lime-200/30 bg-lime-200/10 text-lime-50" : "border-red-300/30 bg-red-500/10 text-red-100"
									}`}
								>
									{message.text}
								</div>
							) : null}
							{discordJob ? (
								<div
									className={`rounded-xl border px-3 py-1.5 text-xs ${
										discordJob.status === "failed"
											? "border-red-300/30 bg-red-500/10 text-red-100"
											: discordJob.status === "completed"
												? "border-lime-200/30 bg-lime-200/10 text-lime-50"
												: "border-cyan-200/24 bg-cyan-300/[0.08] text-cyan-50"
									}`}
								>
									<span className="font-black">{discordJob.title}</span>
									<span className="ml-2 tabular-nums">
										{discordJob.completed}/{discordJob.total || "?"}
									</span>
									{discordJob.current ? <span className="ml-2 text-white/60">{discordJob.current}</span> : null}
									{discordJob.failed > 0 ? <span className="ml-2 text-red-100">{discordJob.failed} Fehler</span> : null}
								</div>
							) : null}
						</div>
					</div>

					<div className="grid gap-3 p-4 xl:grid-cols-[0.9fr_1.25fr_auto]">
						<div className="rounded-2xl border border-white/8 bg-black/16 p-3">
							<div className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100/42">Teams verwalten</div>
							<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
								<button
									type="button"
									onClick={() => setCreateOpen(true)}
									disabled={creating || autoRunning}
									title="Neues Team mit Discord-Rolle und privaten Channels anlegen"
									className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-cyan-200/28 hover:bg-cyan-300/[0.06] hover:text-cyan-50 disabled:opacity-45"
								>
									+ Team anlegen
								</button>
								<button
									type="button"
									onClick={() => openManualSubstituteDialog()}
									disabled={saving || autoRunning || snapshot.teams.length === 0}
									title="Einen Ersatzspieler ohne Website-Bewerbung manuell eintragen"
									className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-amber-200/30 hover:bg-amber-200/[0.06] hover:text-amber-50 disabled:opacity-45"
								>
									+ Ersatzspieler
								</button>
							</div>
						</div>

						<div className="rounded-2xl border border-cyan-200/12 bg-cyan-300/[0.035] p-3">
							<div className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100/48">Teams ausgleichen</div>
							<div className="flex flex-wrap items-center gap-2">
								<div className="flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
									<label
										htmlFor="split-threshold"
										className="text-[10px] font-black uppercase tracking-[0.14em] text-lime-100/70 whitespace-nowrap"
										title="Maximale gewünschte Team-Abweichung. Wunschgruppen werden erst getrennt, wenn gemeinsames Platzieren deutlich unfair wäre oder Rollen stark kollidieren."
									>
										Fairness-Schwelle
									</label>
									<input
										id="split-threshold"
										type="range"
										min={10}
										max={35}
										step={5}
										value={splitThreshold}
										onChange={(event) => setSplitThreshold(Number(event.target.value))}
										disabled={autoRunning}
										className="h-1 w-16 cursor-pointer accent-lime-300"
									/>
									<span suppressHydrationWarning className="min-w-[2.5rem] text-center text-[10px] font-black tabular-nums text-lime-200">
										{splitThreshold}%
									</span>
								</div>
								<button
									type="button"
									onClick={() => setAutoConfirm(true)}
									disabled={autoRunning || saving}
									className="min-h-10 rounded-xl border border-cyan-200/24 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-50 transition hover:border-cyan-200/45 hover:bg-cyan-300/15 disabled:opacity-45"
								>
									{autoRunning ? "Auto-Balance läuft…" : "⚡ Auto-Balance"}
								</button>
							</div>
						</div>

						<div className="grid min-w-64 gap-2">
							<button
								type="button"
								onClick={() => void save()}
								disabled={saving || publishing || autoRunning}
								className="min-h-12 rounded-2xl border border-lime-200/24 bg-lime-200/10 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-lime-50 transition hover:border-lime-200/45 hover:bg-lime-200/15 disabled:opacity-50"
							>
								{saving ? "Speichern…" : "Entwurf speichern"}
							</button>
							<button
								type="button"
								onClick={() => void publish(false)}
								disabled={saving || publishing || autoRunning || rosterDirty || !snapshot.publication.hasUnpublishedChanges || snapshot.testModeActive}
								title={rosterDirty ? "Speichere den Entwurf zuerst." : "Macht Teams öffentlich, synchronisiert Discord-Rollen und sendet aktivierte DMs."}
								className="min-h-14 rounded-2xl bg-gradient-to-br from-lime-200 via-emerald-200 to-cyan-200 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 hover:shadow-lime-300/30 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{publishing ? "Wird veröffentlicht…" : "Teams veröffentlichen"}
							</button>
							<p className="text-center text-[10px] font-bold leading-4 text-emerald-100/42">
								{snapshot.publication.hasUnpublishedChanges
									? "Privater Entwurf wartet auf Veröffentlichung."
									: snapshot.publication.publishedAt
										? `Zuletzt veröffentlicht: ${new Date(snapshot.publication.publishedAt).toLocaleString("de-DE")}`
										: "Noch kein Roster veröffentlicht."}
							</p>
						</div>
					</div>

					<details className="border-t border-white/8 bg-black/10 px-4 py-3">
						<summary className="cursor-pointer select-none text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/48 transition hover:text-emerald-50">
							Wartung & Testwerkzeuge
						</summary>
						<div className="mt-3 flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => void publish(true)}
								disabled={saving || publishing || autoRunning || rosterDirty}
								title="Repariert fehlende Turnier-, Team- und Captain-Rollen für das aktuelle Roster. Nur benutzen, wenn Discord-Rollen fehlen."
								className="rounded-xl border border-amber-200/22 bg-amber-200/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:border-amber-200/42 hover:text-amber-50 disabled:opacity-45"
							>
								Discord-Rollen reparieren
							</button>
							<button
								type="button"
								onClick={() => setTestDataAction("seed")}
								disabled={seeding || autoRunning || snapshot.testModeActive}
								title="Echten Roster sichern und temporär durch 8 vollständige Dummy-Teams ersetzen"
								className="rounded-xl border border-white/12 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/72 transition hover:border-white/24 hover:text-emerald-50 disabled:opacity-45"
							>
								{seeding ? "Wird vorbereitet…" : snapshot.testModeActive ? "Testmodus aktiv" : "+ Testdaten"}
							</button>
							<button
								type="button"
								onClick={() => setTestDataAction("clear")}
								disabled={clearing || autoRunning}
								title="Testdaten entfernen und den zuvor gesicherten echten Roster wiederherstellen"
								className="rounded-xl border border-red-300/20 bg-red-500/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-red-100/78 transition hover:border-red-300/40 hover:bg-red-500/10 hover:text-red-50 disabled:opacity-45"
							>
								{clearing ? "Wird wiederhergestellt…" : snapshot.testModeActive ? "Testmodus beenden" : "Testdaten bereinigen"}
							</button>
						</div>
					</details>
				</section>

				{balanceResult && balanceResult.teamStrengths.length > 0 ? (
					<section className="rounded-[1.8rem] border border-emerald-200/14 bg-emerald-300/[0.035] p-4 shadow-xl shadow-black/16">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<div className="text-xs font-black uppercase tracking-[0.24em] text-emerald-100/64">Balance-Übersicht</div>
								<p className="mt-1 text-xs leading-5 text-emerald-100/48">Durchschnittlicher Spielerskill: {Math.round(balanceResult.overallAverage)}</p>
							</div>
							{(() => {
								const strengths = balanceResult.teamStrengths.map((t) => t.strength).filter((s) => s > 0);
								if (strengths.length < 2) return null;
								const max = Math.max(...strengths);
								const min = Math.min(...strengths);
								const teamAverage = strengths.reduce((a, b) => a + b, 0) / strengths.length;
								const spread = teamAverage > 0 ? Math.round(((max - min) / teamAverage) * 100) : 0;
								return (
									<span
										className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
											spread <= 15
												? "border-lime-200/24 bg-lime-300/10 text-lime-100"
												: spread <= 30
													? "border-amber-200/24 bg-amber-300/10 text-amber-100"
													: "border-red-300/24 bg-red-400/10 text-red-200"
										}`}
										title="Prozentuale Abweichung zwischen stärkstem und schwächstem Team"
									>
										Spread: {spread}%
									</span>
								);
							})()}
						</div>
						{balanceResult.imputedApplicants > 0 ? (
							<div className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/[0.07] px-3 py-2 text-[11px] font-bold leading-5 text-amber-50/76">
								{balanceResult.imputedApplicants} Spieler ohne verwertbaren Solo/Duo-Rang wurden für die Balance mit dem Median aller gewerteten Bewerber berechnet.
								Diese Spieler bitte manuell prüfen.
							</div>
						) : null}
						{balanceResult.highEloPreferredAssignments.length > 0 ? (
							<div className="mt-3 rounded-2xl border border-orange-300/28 bg-gradient-to-r from-orange-400/[0.11] to-red-400/[0.06] p-4 shadow-lg shadow-orange-950/20">
								<div className="flex items-center gap-2">
									<span className="grid size-7 place-items-center rounded-lg bg-orange-200 text-sm font-black text-orange-950">!</span>
									<div>
										<div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-100">Master+ auf Komfortrolle</div>
										<div className="mt-0.5 text-[11px] font-bold text-orange-50/62">
											Kann trotz rechnerisch ähnlicher Elo einen überproportionalen Einfluss auf Matches haben.
										</div>
									</div>
								</div>
								<div className="mt-3 grid gap-2 sm:grid-cols-2">
									{balanceResult.highEloPreferredAssignments.map((entry) => (
										<div key={entry.discordId} className="rounded-xl border border-orange-200/16 bg-black/20 px-3 py-2">
											<div className="font-black text-orange-50">{entry.displayName}</div>
											<div className="mt-0.5 text-[10px] font-bold text-orange-100/58">
												{teamByKey.get(entry.teamKey)?.name ?? entry.teamKey} · {entry.role} · {entry.rank}
											</div>
										</div>
									))}
								</div>
							</div>
						) : null}
						<div
							className="mt-3 grid gap-2"
							style={{
								gridTemplateColumns: `repeat(${Math.min(balanceResult.teamStrengths.length, 8)}, minmax(0, 1fr))`,
							}}
						>
							{(() => {
								const strengths = balanceResult.teamStrengths.map((t) => t.strength).filter((s) => s > 0);
								const teamAverage = strengths.length > 0 ? strengths.reduce((a, b) => a + b, 0) / strengths.length : 0;
								return balanceResult.teamStrengths.map(({ teamKey, strength }) => {
									const team = teamByKey.get(teamKey);
									const barHeight = teamAverage > 0 ? Math.round((strength / teamAverage) * 100) : 0;
									return (
										<div key={teamKey} className="flex flex-col items-center gap-1">
											<div className="relative h-16 w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
												<div
													className="absolute bottom-0 left-0 right-0 rounded-md bg-gradient-to-t from-lime-400/40 to-emerald-400/20 transition-all duration-500"
													style={{ height: `${Math.min(barHeight, 150)}%` }}
												/>
												<span className="absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums text-emerald-50">
													{Math.round(strength)}
												</span>
											</div>
											<span className="text-[9px] font-bold uppercase tracking-wider text-emerald-100/50 truncate max-w-full">{team?.name ?? teamKey}</span>
										</div>
									);
								});
							})()}
						</div>
						{balanceResult.splitGroups.length > 0 ? (
							<div className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/[0.06] p-3">
								<div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Aufgeteilte Wunschgruppen</div>
								<div className="mt-2 space-y-1.5">
									{balanceResult.splitGroups.map((group) => (
										<div key={group.code} className="text-[11px] leading-4 text-amber-50/72">
											<span className="font-bold text-amber-100">{group.code}</span>
											{group.reason === "role_conflict" || group.reason === "capacity" ? (
												<>
													{" — "}
													{group.reason === "role_conflict" ? "wegen Rollen-Konflikten" : "wegen Team-Kapazität"}
													{`. ${group.kept.length} zusammengehalten, ${group.moved.length} verschoben.`}
												</>
											) : group.reason === "too_strong" ? (
												<>
													{" — Gruppendurchschnitt "}
													<span className="font-bold">{Math.round(group.groupAverage)}</span>
													{" ist "}
													<span className="font-bold">{Math.round(group.deviation * 100)}%</span>
													{" über Gesamtdurchschnitt "}
													<span className="font-bold">{Math.round(group.overallAverage)}</span>
													{` (zu stark). ${group.kept.length} zusammengehalten, ${group.moved.length} verschoben.`}
												</>
											) : (
												<>
													{" — Gruppendurchschnitt "}
													<span className="font-bold">{Math.round(group.groupAverage)}</span>
													{" ist "}
													<span className="font-bold">{Math.round(group.deviation * 100)}%</span>
													{" unter Gesamtdurchschnitt "}
													<span className="font-bold">{Math.round(group.overallAverage)}</span>
													{` (zu schwach). ${group.kept.length} zusammengehalten, ${group.moved.length} verschoben.`}
												</>
											)}
										</div>
									))}
								</div>
							</div>
						) : null}
					</section>
				) : null}

				{preferenceGroups.length > 0 ? (
					<section className="rounded-[1.8rem] border border-cyan-200/14 bg-cyan-300/[0.035] p-4 shadow-xl shadow-black/16">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/64">Wunschgruppen</div>
								<p className="mt-1 text-xs leading-5 text-emerald-100/48">Gemeinsame Einteilung ist ein Wunsch und keine Garantie.</p>
							</div>
							<span className="rounded-full border border-cyan-200/16 bg-cyan-300/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-50/66">
								{preferenceGroups.length} Wunschgruppen
							</span>
						</div>
						<div className="mt-4 grid gap-2 md:grid-cols-5">
							<GroupSummaryTile label="Komplett zusammen" value={preferenceGroupSummary.together} tone="ok" />
							<GroupSummaryTile label="Teilweise zusammen" value={preferenceGroupSummary.partial} tone="warn" />
							<GroupSummaryTile label="Getrennt" value={preferenceGroupSummary.split} tone="danger" />
							<GroupSummaryTile label="Noch offen" value={preferenceGroupSummary.open} tone="neutral" />
							<GroupSummaryTile label="Mit Wunschgruppe" value={`${preferenceGroupSummary.membersTogether}/${preferenceGroupSummary.totalMembers}`} tone="info" />
						</div>
						<div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
							{preferenceGroups.map(({ code, members }) => {
								const assignedTeamKeys = new Set(
									members.map((member) => state.assignments.get(member.discordId)?.teamKey).filter((teamKey): teamKey is string => Boolean(teamKey))
								);
								const placement =
									assignedTeamKeys.size === 0
										? "Noch nicht zugewiesen"
										: assignedTeamKeys.size === 1
											? `Gemeinsam: ${teamByKey.get([...assignedTeamKeys][0])?.name ?? [...assignedTeamKeys][0]}`
											: `Auf ${assignedTeamKeys.size} Teams verteilt`;
								const groupSummary = preferenceGroupSummary.rows.find((row) => row.code === code);

								return (
									<div key={code} className="rounded-2xl border border-white/9 bg-black/18 p-3">
										<div className="flex items-center justify-between gap-3">
											<PreferenceGroupBadge code={code} />
											<span className="text-[10px] font-black text-emerald-100/38">
												{groupSummary?.largestTogether ?? 0}/{members.length} zusammen
											</span>
										</div>
										<div className="mt-2 text-[10px] font-bold text-cyan-100/54">{placement}</div>
										<div className="mt-2 flex flex-wrap gap-1">
											{members.map((member) => (
												<span
													key={member.discordId}
													className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1 text-[10px] font-bold text-emerald-100/68"
												>
													{member.displayName}
												</span>
											))}
										</div>
									</div>
								);
							})}
						</div>
					</section>
				) : null}
				{usesGroups && snapshot.teams.length > 0 ? (
					<GroupAssignmentBoard key={`${groupCount}-${plannedTeamCount}`} teams={snapshot.teams} groupCount={groupCount} plannedTeamCount={plannedTeamCount} />
				) : null}

				{snapshot.teams.length > 0 ? (
					<div className="flex items-center gap-3 pt-1">
						<div className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-200/52">Team-Workbench</div>
						<div className="h-px flex-1 bg-gradient-to-r from-lime-200/16 to-transparent" />
					</div>
				) : null}
				<div className="grid gap-4 lg:grid-cols-2">
					{snapshot.teams.map((team) => (
						<TeamCard
							key={team.key}
							team={team}
							playersByRole={playersByTeamRole.get(team.key) ?? new Map()}
							applicantById={applicantById}
							captainId={state.captains.get(team.key) ?? null}
							pulsingId={pulseId}
							deletingThisTeam={deletingTeam && deleteTeamTarget?.key === team.key}
							onAssignClick={handleAssignClick}
							onUnassign={unassignPlayer}
							onSetRole={setRole}
							onToggleCaptain={toggleCaptain}
							onAddManualSubstitute={openManualSubstituteDialog}
							onEditTeam={handleEditTeam}
							onDeleteTeam={handleDeleteTeam}
						/>
					))}
				</div>
			</main>

			{picker ? (
				<Picker
					teamName={teamByKey.get(picker.teamKey)?.name ?? picker.teamKey}
					role={picker.role}
					candidates={unassigned}
					onCancel={() => setPicker(null)}
					onPick={(discordId) => {
						assignPlayer(discordId, picker.teamKey, picker.role);
						setPicker(null);
					}}
				/>
			) : null}

			{manualSubOpen ? (
				<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center px-5">
					<button type="button" aria-label="Schließen" onClick={() => setManualSubOpen(false)} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
					<div className="relative w-full max-w-lg rounded-[1.8rem] border border-amber-200/18 bg-gradient-to-br from-emerald-950 via-emerald-950 to-black p-6 shadow-2xl shadow-black/50">
						<div className="text-xs font-black uppercase tracking-[0.24em] text-amber-200/72">Notfall-Ersatzspieler</div>
						<h2 className="mt-2 text-2xl font-black text-emerald-50">Spieler manuell eintragen</h2>
						<p className="mt-2 text-sm leading-6 text-emerald-100/58">
							Dieser Spieler wird dem Team als Substitute hinzugefügt, erhält die Discord-Rollen, gilt aber sichtbar als nicht verifiziert.
						</p>

						<div className="mt-5 grid gap-3">
							<label className="grid gap-1.5">
								<span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">Team</span>
								<ThemedSelect
									value={manualSubTeamKey}
									onChange={setManualSubTeamKey}
									ariaLabel="Team für den Ersatzspieler"
									options={snapshot.teams.map((team) => ({ value: team.key, label: team.name }))}
								/>
							</label>
							<div className="grid gap-3 sm:grid-cols-2">
								<label className="grid gap-1.5">
									<span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">Discord-ID</span>
									<input
										value={manualSubDiscordId}
										onChange={(event) => setManualSubDiscordId(event.target.value)}
										inputMode="numeric"
										placeholder="337568120028004362"
										className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/24 focus:border-lime-200/40"
									/>
								</label>
								<label className="grid gap-1.5">
									<span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">Discord-Benutzername</span>
									<input
										value={manualSubDiscordUsername}
										onChange={(event) => setManualSubDiscordUsername(event.target.value)}
										placeholder="lethalfluff"
										className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/24 focus:border-lime-200/40"
									/>
								</label>
							</div>
							<label className="grid gap-1.5">
								<span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">Gewünschter Discord-Nickname</span>
								<input
									value={manualSubDisplayName}
									onChange={(event) => setManualSubDisplayName(event.target.value)}
									maxLength={32}
									placeholder="So soll die Person heißen"
									className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/24 focus:border-lime-200/40"
								/>
								<span className="text-[10px] leading-4 text-emerald-100/36">
									Wird für „Nickname | Riot-ID“ verwendet und muss nicht dem Discord- oder Riot-Namen entsprechen.
								</span>
							</label>
							<label className="grid gap-1.5">
								<span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">Riot-ID</span>
								<input
									value={manualSubRiotId}
									onChange={(event) => setManualSubRiotId(event.target.value)}
									placeholder="LethalFluff#poof"
									className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/24 focus:border-lime-200/40"
								/>
							</label>
						</div>

						<div className="mt-6 flex flex-wrap justify-end gap-2">
							<button
								type="button"
								onClick={() => setManualSubOpen(false)}
								className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-100"
							>
								Abbrechen
							</button>
							<button
								type="button"
								onClick={addManualSubstitute}
								className="rounded-xl bg-gradient-to-r from-amber-200 via-lime-200 to-emerald-200 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-950"
							>
								Als Ersatzspieler hinzufügen
							</button>
						</div>
					</div>
				</div>
			) : null}

			<ConfirmDialog
				open={!!deleteTeamTarget}
				title="Team wirklich löschen?"
				description={
					<>
						<strong className="text-emerald-50">{deleteTeamTarget?.name}</strong> wird aus dem Bot entfernt. Alle Spieler dieses Teams fallen zurück in „Nicht
						zugewiesen“. Gespeicherte Match-Scores bleiben — sie referenzieren das Team aber ggf. ins Leere. Diese Aktion lässt sich nicht rückgängig machen.
					</>
				}
				confirmLabel="Ja, löschen"
				cancelLabel="Abbrechen"
				tone="danger"
				onConfirm={performDeleteTeam}
				onCancel={() => setDeleteTeamTarget(null)}
			/>

			<ConfirmDialog
				open={autoConfirm}
				title="Roster automatisch ausbalancieren?"
				description={
					<>
						Das löscht jede aktuelle Zuweisung und verteilt nach Rang neu. Wunschgruppen werden zusammengehalten, sofern ihr gemeinsamer Skill nicht zu stark vom
						Gesamtdurchschnitt abweicht. Wunschrollen werden nach ihrer angegebenen Reihenfolge gewichtet: Wunsch #1 zählt deutlich stärker als #2, #3 usw.{" "}
						<strong className="text-emerald-50">Captains werden zurückgesetzt.</strong> Du kannst danach manuell anpassen, bevor du speicherst.
					</>
				}
				confirmLabel="Teams ausbalancieren"
				cancelLabel="Abbrechen"
				onConfirm={runAutoBalance}
				onCancel={() => setAutoConfirm(false)}
			/>

			<ConfirmDialog
				open={testDataAction === "seed"}
				title="Testdaten wirklich anlegen?"
				description={
					<>
						Der aktuelle echte Roster sowie Match-, Draft-, Swiss- und Ultimate-Bravery-Daten werden unverändert gesichert. Danach übernehmen
						<strong className="text-emerald-50"> acht vollständige 5er-Teams</strong> und 40 Test-Bewerbungen. Damit kannst du Auto-Balance und den gesamten
						Turnierablauf testen. Roster-Saves bleiben währenddessen rein in MongoDB; Discord-Rollen und Channels werden nicht verändert.
					</>
				}
				confirmLabel="Testdaten anlegen"
				cancelLabel="Abbrechen"
				onConfirm={() => void seedTestData()}
				onCancel={() => setTestDataAction(null)}
			/>

			<ConfirmDialog
				open={testDataAction === "clear"}
				title={snapshot.testModeActive ? "Testmodus beenden?" : "Testdaten wirklich löschen?"}
				description={
					<>
						Die Dummy-Teams und Test-Bewerbungen werden entfernt. Anschließend werden der zuvor gespeicherte echte Roster sowie Match-, Draft-, Swiss- und
						Ultimate-Bravery-Daten exakt wiederhergestellt. Es werden dabei keine Discord-Jobs ausgelöst.
					</>
				}
				confirmLabel={snapshot.testModeActive ? "Testmodus beenden" : "Testdaten bereinigen"}
				cancelLabel="Abbrechen"
				tone="danger"
				onConfirm={() => void clearTestData()}
				onCancel={() => setTestDataAction(null)}
			/>

			{createOpen ? (
				<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center px-5">
					<button type="button" aria-label="Schließen" onClick={() => setCreateOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
					<div className="relative w-full max-w-md rounded-[1.7rem] border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-5 shadow-2xl shadow-black/40">
						<div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/72">Neues Team</div>
						<h2 className="mt-2 text-lg font-black text-emerald-50">Team anlegen</h2>
						<p className="mt-1 text-xs text-emerald-100/52">
							Das Team wird gespeichert. Discord-Rolle sowie privater Text- und Voice-Channel werden anschließend automatisch über die Job-Queue erstellt.
						</p>

						<div className="mt-4 grid gap-3">
							<label className="grid gap-1">
								<span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">Teamname</span>
								<input
									value={newTeamName}
									onChange={(e) => setNewTeamName(e.target.value)}
									placeholder="z. B. Sprout Squad"
									className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/30 focus:border-lime-200/40"
								/>
							</label>

							<div className="rounded-xl border border-cyan-200/14 bg-cyan-300/[0.045] px-3 py-3 text-xs leading-5 text-cyan-50/64">
								Teams werden immer neutral angelegt. Falls eine Gruppenphase gewählt ist, erfolgt die Einteilung anschließend gesammelt im Gruppenplaner des
								Roster-Builders.
							</div>
						</div>

						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setCreateOpen(false)}
								className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100"
							>
								Abbrechen
							</button>
							<button
								type="button"
								onClick={createTeam}
								disabled={creating || !newTeamName.trim()}
								className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 disabled:opacity-60"
							>
								{creating ? "Wird erstellt…" : "Team erstellen"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{editTeamTarget ? (
				<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center px-5">
					<button type="button" aria-label="Schließen" onClick={() => setEditTeamTarget(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
					<div className="relative w-full max-w-md rounded-[1.7rem] border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-5 shadow-2xl shadow-black/40">
						<div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/72">Team bearbeiten</div>
						<h2 className="mt-2 text-lg font-black text-emerald-50">{editTeamTarget.name}</h2>
						<p className="mt-1 text-xs text-emerald-100/52">
							Ändert den Teamnamen sowie die zugehörigen Discord-Ressourcen. Gruppe und Seed werden zentral im Gruppenplaner verwaltet.
						</p>

						<div className="mt-4 grid gap-3">
							<label className="grid gap-1">
								<span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">Teamname</span>
								<input
									value={editTeamName}
									onChange={(e) => setEditTeamName(e.target.value)}
									className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/30 focus:border-lime-200/40"
								/>
							</label>
						</div>

						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setEditTeamTarget(null)}
								className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100"
							>
								Abbrechen
							</button>
							<button
								type="button"
								onClick={updateTeam}
								disabled={editingTeam || !editTeamName.trim()}
								className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 disabled:opacity-60"
							>
								{editingTeam ? "Speichert…" : "Team speichern"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{/* One-shot pulse animation when the auto-fill highlights a new assignment */}
			<style>{`
        @keyframes roster-row-pop {
          0%   { background-color: rgba(190, 242, 100, 0.28); }
          100% { background-color: transparent; }
        }
        .roster-row-pulse {
          animation: roster-row-pop 800ms ease-out;
        }
      `}</style>
		</div>
	);
}

const TeamCard = memo(function TeamCard({
	team,
	playersByRole,
	applicantById,
	captainId,
	pulsingId,
	deletingThisTeam,
	onAssignClick,
	onUnassign,
	onSetRole,
	onToggleCaptain,
	onAddManualSubstitute,
	onEditTeam,
	onDeleteTeam,
}: {
	team: RosterTeam;
	playersByRole: Map<PlayerRole, string[]>;
	applicantById: Map<string, RosterApplicant>;
	captainId: string | null;
	pulsingId: string | null;
	deletingThisTeam: boolean;
	onAssignClick: (teamKey: string, role: PlayerRole) => void;
	onUnassign: (discordId: string) => void;
	onSetRole: (discordId: string, role: PlayerRole) => void;
	onToggleCaptain: (teamKey: string, discordId: string) => void;
	onAddManualSubstitute: (teamKey: string) => void;
	onEditTeam: (teamKey: string) => void;
	onDeleteTeam: (teamKey: string) => void;
}) {
	const ratedStarterScores = ROLES.flatMap((role) =>
		(playersByRole.get(role) ?? []).map((discordId) => {
			const applicant = applicantById.get(discordId);
			return parseRank(applicant?.manualRankOverride || applicant?.currentRank);
		})
	).filter((score) => score > 0);
	const averageElo = ratedStarterScores.length > 0 ? Math.round(ratedStarterScores.reduce((total, score) => total + score, 0) / ratedStarterScores.length) : null;

	return (
		<article className="rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
			<header className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-lg font-black text-emerald-50">{team.name}</div>
					<div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">
						{team.group ? `Gruppe ${team.group}` : "Keine Gruppe"}
						{team.seed ? ` · Seed ${team.seed}` : ""}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={() => onEditTeam(team.key)}
						title="Team bearbeiten"
						aria-label="Team bearbeiten"
						className="inline-flex size-6 items-center justify-center rounded-md border border-white/12 bg-black/24 text-xs text-emerald-100/52 transition hover:border-lime-200/40 hover:text-lime-100"
					>
						✎
					</button>
					<button
						type="button"
						onClick={() => onDeleteTeam(team.key)}
						disabled={deletingThisTeam}
						title="Team löschen"
						aria-label="Team löschen"
						className="inline-flex size-6 items-center justify-center rounded-md border border-white/12 bg-black/24 text-xs text-emerald-100/52 transition hover:border-rose-300/40 hover:text-rose-200 disabled:opacity-50"
					>
						✕
					</button>
				</div>
			</header>

			<div
				className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/16 bg-cyan-300/[0.07] px-2.5 py-1"
				title={`Interner Vergleichswert: ${averageElo?.toLocaleString("de-DE") ?? "keine Wertung"}`}
			>
				<span className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/52">Ø Rang</span>
				<span className="text-xs font-black text-cyan-50">{formatRankScore(averageElo)}</span>
				<span className="text-[8px] font-bold uppercase tracking-[0.12em] text-cyan-100/34">{ratedStarterScores.length}/5 gewertet</span>
			</div>

			<div className="mt-3 grid gap-2">
				{ROLES.map((role) => {
					const slots = playersByRole.get(role) ?? [];
					if (slots.length === 0) {
						return (
							<button
								key={role}
								type="button"
								onClick={() => onAssignClick(team.key, role)}
								className="flex w-full items-center justify-between rounded-xl border border-dashed border-white/14 bg-black/12 px-3 py-2 text-left text-xs font-bold text-emerald-100/52 transition hover:border-lime-200/40 hover:text-lime-100"
							>
								<span className="font-black uppercase tracking-[0.22em] text-lime-200/52">{role}</span>
								<span>+ Zuweisen</span>
							</button>
						);
					}
					return slots.map((discordId) => {
						const applicant = applicantById.get(discordId);
						return (
							<PlayerRow
								key={`${role}-${discordId}`}
								discordId={discordId}
								applicant={applicant}
								role={role}
								isCaptain={captainId === discordId}
								pulsing={pulsingId === discordId}
								teamKey={team.key}
								onUnassign={onUnassign}
								onSetRole={onSetRole}
								onToggleCaptain={onToggleCaptain}
							/>
						);
					});
				})}

				<button
					type="button"
					onClick={() => onAssignClick(team.key, "Sub")}
					className="flex w-full items-center justify-between rounded-xl border border-dashed border-amber-200/20 bg-amber-200/[0.05] px-3 py-2 text-left text-xs font-bold text-amber-100/68 transition hover:border-amber-200/44 hover:text-amber-50"
				>
					<span className="font-black uppercase tracking-[0.22em] text-amber-100/58">Substitute</span>
					<span>+ Hinzufügen</span>
				</button>
				<button
					type="button"
					onClick={() => onAddManualSubstitute(team.key)}
					className="flex w-full items-center justify-between rounded-xl border border-dashed border-orange-200/18 bg-orange-200/[0.04] px-3 py-2 text-left text-xs font-bold text-orange-100/66 transition hover:border-orange-200/40 hover:text-orange-50"
				>
					<span className="font-black uppercase tracking-[0.18em]">Ohne Bewerbung</span>
					<span>+ Manuell</span>
				</button>

				{/* Fill / Sub buckets (shown only if used) */}
				{(["Fill", "Sub"] as PlayerRole[]).map((role) => {
					const slots = playersByRole.get(role) ?? [];
					if (slots.length === 0) return null;
					return slots.map((discordId) => {
						const applicant = applicantById.get(discordId);
						return (
							<PlayerRow
								key={`${role}-${discordId}`}
								discordId={discordId}
								applicant={applicant}
								role={role}
								isCaptain={captainId === discordId}
								pulsing={pulsingId === discordId}
								teamKey={team.key}
								onUnassign={onUnassign}
								onSetRole={onSetRole}
								onToggleCaptain={onToggleCaptain}
							/>
						);
					});
				})}
			</div>
		</article>
	);
});

const PlayerRow = memo(function PlayerRow({
	discordId,
	applicant,
	role,
	isCaptain,
	pulsing,
	teamKey,
	onUnassign,
	onSetRole,
	onToggleCaptain,
}: {
	discordId: string;
	applicant: RosterApplicant | undefined;
	role: PlayerRole;
	isCaptain: boolean;
	pulsing?: boolean;
	teamKey: string;
	onUnassign: (discordId: string) => void;
	onSetRole: (discordId: string, role: PlayerRole) => void;
	onToggleCaptain: (teamKey: string, discordId: string) => void;
}) {
	const discordUsername = applicant?.discordUsername?.replace(/^@+/, "").trim();
	const playerLabel = discordUsername ? `@${discordUsername}` : applicant?.discordHandle?.trim() || applicant?.displayName?.trim() || discordId;
	const masterPlusOnRequestedRole = Boolean(applicant && isMasterPlusOnRequestedRole(applicant, role));
	const rolePreferenceIndex = applicant?.preferredRoles.findIndex((entry) => normalizeRoleName(entry) === role) ?? -1;

	return (
		<div
			className={`grid gap-2.5 rounded-xl border px-3 py-2.5 ${
				masterPlusOnRequestedRole
					? "border-orange-300/38 bg-orange-300/[0.09] shadow-lg shadow-orange-950/15"
					: isCaptain
						? "border-lime-200/40 bg-lime-200/10"
						: "border-white/10 bg-black/24"
			} ${pulsing ? "roster-row-pulse" : ""}`}
		>
			<div className="min-w-0">
				<div className="flex min-w-0 items-center gap-2">
					<div className="min-w-0 flex-1 truncate text-sm font-black text-emerald-50" title={playerLabel}>
						{playerLabel}
					</div>
					{isCaptain ? (
						<span className="shrink-0 rounded-full border border-lime-200/28 bg-lime-200/12 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-lime-50">
							Captain
						</span>
					) : null}
					{rolePreferenceIndex >= 0 ? (
						<span className="shrink-0 rounded-full border border-cyan-200/24 bg-cyan-200/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.11em] text-cyan-50">
							Wunsch #{rolePreferenceIndex + 1}
						</span>
					) : null}
					{masterPlusOnRequestedRole ? (
						<span
							className="shrink-0 rounded-full border border-orange-200/30 bg-orange-200/12 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.11em] text-orange-50"
							title="Master+ auf Main- oder Wunschrolle: manuell auf Teamfairness prüfen"
						>
							Master+ Komfort
						</span>
					) : null}
					{applicant?.verified === false ? (
						<span className="shrink-0 rounded-full border border-amber-200/28 bg-amber-200/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">
							Nicht verifiziert
						</span>
					) : null}
				</div>
				<div
					className="mt-0.5 truncate text-[10px] text-emerald-100/52"
					title={[applicant?.riotId, applicant?.manualRankOverride || applicant?.currentRank].filter(Boolean).join(" · ")}
				>
					{applicant?.riotId ?? "(no riot id)"}
					{applicant?.manualRankOverride || applicant?.currentRank ? ` · ${applicant?.manualRankOverride || applicant?.currentRank}` : ""}
				</div>
				{applicant?.preferenceGroupCode ? (
					<div className="mt-1.5">
						<PreferenceGroupBadge code={applicant.preferenceGroupCode} />
					</div>
				) : null}
			</div>

			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
				<label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
					<span className="text-[9px] font-black uppercase tracking-[0.16em] text-lime-200/52">Rolle</span>
					<ThemedSelect
						value={role}
						onChange={(value) => onSetRole(discordId, value as PlayerRole)}
						ariaLabel={`Rolle von ${applicant?.displayName ?? discordId}`}
						compact
						className="font-black uppercase tracking-[0.12em] text-lime-100"
						options={ALL_ROLES.map((entry) => ({ value: entry, label: entry }))}
					/>
				</label>

				<div className="flex shrink-0 items-center gap-1">
					{applicant?.riotId ? (
						<a
							href={opggUrl(applicant.riotId)}
							target="_blank"
							rel="noreferrer"
							title={`${applicant.riotId} auf OP.GG öffnen`}
							aria-label={`${applicant.riotId} auf OP.GG öffnen`}
							className="inline-flex h-8 items-center rounded-lg border border-white/12 bg-black/24 px-2 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-100/64 transition hover:border-lime-200/34 hover:text-lime-100"
						>
							OP.GG
						</a>
					) : null}
					{applicant?.verified !== false ? (
						<button
							type="button"
							onClick={() => onToggleCaptain(teamKey, discordId)}
							title={isCaptain ? "Captain entfernen" : "Zum Captain machen"}
							aria-label={isCaptain ? "Captain entfernen" : "Zum Captain machen"}
							className={`inline-flex size-8 items-center justify-center rounded-lg border text-xs transition ${
								isCaptain
									? "border-lime-200/40 bg-lime-200/14 text-lime-50"
									: "border-white/12 bg-black/24 text-emerald-100/52 hover:border-lime-200/30 hover:text-lime-100"
							}`}
						>
							⭐
						</button>
					) : null}
					<button
						type="button"
						onClick={() => onUnassign(discordId)}
						title="Vom Team entfernen"
						aria-label="Vom Team entfernen"
						className="inline-flex size-8 items-center justify-center rounded-lg border border-white/12 bg-black/24 text-xs text-emerald-100/52 transition hover:border-red-300/30 hover:text-red-200"
					>
						✕
					</button>
				</div>
			</div>
			{applicant ? <ApplicationDetails applicant={applicant} compact /> : null}
		</div>
	);
});

function isMasterPlusOnRequestedRole(applicant: RosterApplicant, role: PlayerRole) {
	if (!ROLES.includes(role)) return false;
	const rank = applicant.manualRankOverride || applicant.currentRank;
	if (!rank || parseRank(rank) < 2800) return false;
	const mainRole = applicant.mainRole ? normalizeRoleName(applicant.mainRole) : null;
	const preferredRoles = applicant.preferredRoles.map(normalizeRoleName);
	return mainRole === role || preferredRoles.includes(role);
}

const RANK_TIERS = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger"] as const;
const RANK_DIVISIONS = ["IV", "III", "II", "I"] as const;
const APEX_TIERS = new Set(["Master", "Grandmaster", "Challenger"]);

function formatRankString(tier: string, division?: string, lp?: number): string | null {
	if (!tier) return null;
	if (APEX_TIERS.has(tier)) {
		return lp && lp > 0 ? `${tier} (${lp} LP)` : tier;
	}
	return division ? `${tier} ${division}` : tier;
}

function ApplicantCard({
	applicant,
	isEditing,
	editingTier,
	editingDivision,
	editingLp,
	onStartEdit,
	onTierChange,
	onDivisionChange,
	onLpChange,
	onSaveRank,
}: {
	applicant: RosterApplicant;
	compact?: boolean;
	isEditing: boolean;
	editingTier: string;
	editingDivision: string;
	editingLp: string;
	onStartEdit: () => void;
	onTierChange: (tier: string) => void;
	onDivisionChange: (division: string) => void;
	onLpChange: (lp: string) => void;
	onSaveRank: (rankStr: string | null) => void;
}) {
	const effectiveRank = applicant.manualRankOverride || applicant.currentRank;
	const hasOverride = Boolean(applicant.manualRankOverride);

	return (
		<div className="rounded-xl border border-white/10 bg-black/22 p-3">
			<div className="truncate text-sm font-black text-emerald-50">{applicant.discordUsername ? `@${applicant.discordUsername}` : applicant.discordHandle}</div>
			<div className="mt-0.5 flex items-center gap-2">
				<div className="min-w-0 flex-1 truncate text-[10px] text-emerald-100/52">{applicant.riotId}</div>
				<a
					href={opggUrl(applicant.riotId)}
					target="_blank"
					rel="noreferrer"
					className="shrink-0 rounded-md border border-white/12 bg-black/24 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/58 transition hover:border-lime-200/34 hover:text-lime-100"
				>
					OP.GG
				</a>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-1">
				{applicant.verified === false ? (
					<span className="rounded-full border border-amber-200/28 bg-amber-200/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">
						Nicht verifiziert
					</span>
				) : null}
				{applicant.preferenceGroupCode ? <PreferenceGroupBadge code={applicant.preferenceGroupCode} /> : null}
				{isEditing ? (
					<div className="flex items-center gap-1">
						<ThemedSelect
							value={editingTier}
							onChange={(val) => {
								if (val === "__reset__") {
									onSaveRank(null);
									return;
								}
								onTierChange(val);
								if (APEX_TIERS.has(val)) {
									onDivisionChange("");
								} else {
									onLpChange("");
								}
							}}
							ariaLabel={`Rang-Tier von ${applicant.displayName}`}
							compact
							className="font-bold text-lime-100"
							options={[{ value: "__reset__", label: "Auto (Riot)" }, { value: "", label: "Unranked" }, ...RANK_TIERS.map((tier) => ({ value: tier, label: tier }))]}
						/>
						{editingTier && !APEX_TIERS.has(editingTier) ? (
							<ThemedSelect
								value={editingDivision}
								onChange={(value) => {
									onDivisionChange(value);
									onSaveRank(formatRankString(editingTier, value));
								}}
								ariaLabel={`Rang-Division von ${applicant.displayName}`}
								compact
								className="font-bold text-lime-100"
								options={RANK_DIVISIONS.map((division) => ({ value: division, label: division }))}
							/>
						) : null}
						{editingTier && APEX_TIERS.has(editingTier) ? (
							<>
								<ThemedNumberInput
									min={0}
									max={999}
									value={editingLp}
									onChange={onLpChange}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === "Escape") {
											onSaveRank(formatRankString(editingTier, undefined, Number(event.currentTarget.value) || undefined));
										}
									}}
									placeholder="LP"
									ariaLabel={`LP von ${applicant.displayName}`}
									compact
									className="w-28"
								/>
								<button
									type="button"
									onClick={() => onSaveRank(formatRankString(editingTier, undefined, editingLp ? Number(editingLp) : undefined))}
									className="rounded-lg border border-lime-200/30 bg-lime-200/10 px-1.5 py-0.5 text-[10px] font-bold text-lime-100 transition hover:border-lime-200/50"
								>
									✓
								</button>
							</>
						) : null}
						{!editingTier ? (
							<button
								type="button"
								onClick={() => onSaveRank(null)}
								className="rounded-lg border border-lime-200/30 bg-lime-200/10 px-1.5 py-0.5 text-[10px] font-bold text-lime-100 transition hover:border-lime-200/50"
							>
								✓
							</button>
						) : null}
					</div>
				) : effectiveRank ? (
					<button
						type="button"
						onClick={onStartEdit}
						title={hasOverride ? `Überschrieben: ${applicant.manualRankOverride} (Klicken zum Ändern)` : "Klicken zum Überschreiben"}
						className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${
							hasOverride
								? "border-amber-200/30 bg-amber-200/10 text-amber-100 hover:border-amber-200/50"
								: "border-lime-200/24 bg-lime-200/10 text-lime-50 hover:border-lime-200/40"
						}`}
					>
						{hasOverride ? "★ " : ""}
						{effectiveRank}
					</button>
				) : (
					<button
						type="button"
						onClick={onStartEdit}
						className="rounded-full border border-dashed border-white/15 bg-white/[0.03] px-2 py-0.5 text-[10px] text-emerald-100/40 transition hover:border-white/25"
					>
						Rang eintragen
					</button>
				)}
				{applicant.mainRole ? (
					<span className="rounded-full border border-cyan-200/24 bg-cyan-200/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-50">
						Main {applicant.mainRole}
					</span>
				) : null}
				{applicant.preferredRoles.map((r, index) => (
					<span key={r} className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">
						#{index + 1} · {r}
					</span>
				))}
			</div>
			<ApplicationDetails applicant={applicant} />
		</div>
	);
}

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

function ApplicationDetails({ applicant, compact = false }: { applicant: RosterApplicant; compact?: boolean }) {
	if (applicant.source === "manual") {
		return (
			<div className={`${compact ? "mt-0" : "mt-3"} rounded-xl border border-amber-200/16 bg-amber-200/[0.05] px-3 py-2 text-[10px] leading-5 text-amber-100/72`}>
				Manuell eingetragener Ersatzspieler. Discord- und Riot-Konto wurden nicht über die Website verifiziert.
			</div>
		);
	}

	const submittedAt = dateFormatter.format(new Date(applicant.createdAt));

	return (
		<details className={`${compact ? "mt-0" : "mt-3"} rounded-xl border border-cyan-200/12 bg-cyan-300/[0.035]`}>
			<summary className="cursor-pointer list-none px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-100/70 transition hover:text-cyan-50">
				Bewerbung ansehen
			</summary>
			<div className="grid gap-2 border-t border-white/8 px-3 py-3 text-[11px]">
				<ApplicationDetailRow label="Anzeigename" value={applicant.displayName} />
				<ApplicationDetailRow
					label="Rollen"
					value={
						[
							applicant.mainRole ? `Main: ${applicant.mainRole}` : "",
							applicant.preferredRoles.length > 0 ? `Wünsche: ${applicant.preferredRoles.map((role, index) => `#${index + 1} ${role}`).join(", ")}` : "",
						]
							.filter(Boolean)
							.join(" · ") || "Keine Angaben"
					}
				/>
				<ApplicationDetailRow label="Termine" value={applicant.availableAllDates ? "Für beide Tage bestätigt" : "Nicht bestätigt"} />
				<ApplicationDetailRow label="Eingegangen" value={`${submittedAt} Uhr`} />
				<ApplicationDetailRow
					label="Zustimmungen"
					value={applicant.acceptedRules && applicant.acceptedDataStorage ? "Regeln und Datenspeicherung bestätigt" : "Unvollständig"}
				/>
				<div>
					<div className="font-black uppercase tracking-[0.14em] text-lime-200/52">Notiz</div>
					<p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/8 bg-black/20 p-2 leading-5 text-emerald-100/72">
						{applicant.notes || "Keine Notiz hinterlegt."}
					</p>
				</div>
			</div>
		</details>
	);
}

function ApplicationDetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
			<span className="font-black uppercase tracking-[0.14em] text-lime-200/52">{label}</span>
			<span className="min-w-0 break-words text-emerald-100/72">{value}</span>
		</div>
	);
}

function GroupSummaryTile({ label, value, tone }: { label: string; value: number | string; tone: "ok" | "warn" | "danger" | "neutral" | "info" }) {
	const tones = {
		ok: "border-lime-200/22 bg-lime-300/[0.08] text-lime-50",
		warn: "border-amber-200/22 bg-amber-300/[0.08] text-amber-50",
		danger: "border-red-300/22 bg-red-400/[0.08] text-red-100",
		neutral: "border-white/10 bg-black/18 text-emerald-100/66",
		info: "border-cyan-200/18 bg-cyan-300/[0.07] text-cyan-50",
	} as const;

	return (
		<div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
			<div className="text-lg font-black tabular-nums">{value}</div>
			<div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.14em] opacity-60">{label}</div>
		</div>
	);
}

function Picker({
	teamName,
	role,
	candidates,
	onCancel,
	onPick,
}: {
	teamName: string;
	role: PlayerRole;
	candidates: RosterApplicant[];
	onCancel: () => void;
	onPick: (discordId: string) => void;
}) {
	// Rank applicants by the explicit order of their role preferences.
	const decorated = useMemo(
		() =>
			candidates
				.map((a) => ({
					applicant: a,
					priority: a.preferredRoles.findIndex((r) => r.toLowerCase() === role.toLowerCase()),
				}))
				.sort((a, b) => {
					const aPriority = a.priority < 0 ? Number.MAX_SAFE_INTEGER : a.priority;
					const bPriority = b.priority < 0 ? Number.MAX_SAFE_INTEGER : b.priority;
					if (aPriority !== bPriority) return aPriority - bPriority;
					// Fall back to alphabetical by display name
					return (a.applicant.discordUsername ?? "").localeCompare(b.applicant.discordUsername ?? "");
				}),
		[candidates, role]
	);

	return (
		<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center px-5">
			<button type="button" aria-label="Schließen" onClick={onCancel} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
			<div className="relative w-full max-w-md rounded-[1.7rem] border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-5 shadow-2xl shadow-black/40">
				<div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/72">Zuweisen · {role}</div>
				<h2 className="mt-2 text-lg font-black text-emerald-50">{teamName}</h2>

				<div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
					{decorated.length === 0 ? (
						<div className="rounded-xl border border-white/10 bg-black/24 p-4 text-sm text-emerald-100/52">Keine verfügbaren verifizierten Bewerber mehr.</div>
					) : (
						<div className="grid gap-2">
							{decorated.map(({ applicant, priority }) => {
								const preferred = priority >= 0;
								return (
									<button
										key={applicant.discordId}
										type="button"
										onClick={() => onPick(applicant.discordId)}
										className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
											preferred ? "border-lime-200/30 bg-lime-200/[0.06] hover:border-lime-200/50" : "border-white/10 bg-black/24 hover:border-lime-200/30"
										}`}
									>
										<div className="min-w-0">
											<div className="truncate text-sm font-black text-emerald-50">
												{applicant.discordUsername ? `@${applicant.discordUsername}` : applicant.discordHandle}
												{preferred ? (
													<span className="ml-2 text-[10px] font-bold uppercase tracking-[0.18em] text-lime-200/72">Wunsch #{priority + 1}</span>
												) : null}
											</div>
											<div className="truncate text-[10px] text-emerald-100/52">
												{applicant.riotId}
												{applicant.manualRankOverride || applicant.currentRank ? ` · ${applicant.manualRankOverride || applicant.currentRank}` : ""}
											</div>
											{applicant.preferenceGroupCode ? (
												<div className="mt-1">
													<PreferenceGroupBadge code={applicant.preferenceGroupCode} />
												</div>
											) : null}
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>

				<div className="mt-4 flex justify-end">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100"
					>
						Abbrechen
					</button>
				</div>
			</div>
		</div>
	);
}

function PreferenceGroupBadge({ code }: { code: string }) {
	return (
		<span
			title="Unverbindliche Wunschgruppe"
			className="inline-flex rounded-full border border-cyan-200/22 bg-cyan-300/10 px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-cyan-50/76"
		>
			Wunsch · {code}
		</span>
	);
}
