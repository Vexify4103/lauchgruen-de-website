"use client";

import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerRole, RosterApplicant, RosterSnapshot, RosterTeam } from "@/lib/roster";
import { snakeFillAssignments, type BalanceResult } from "@/lib/snake-fill";
import { formatRankScore, parseRank } from "@/lib/rank-score";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";

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
					riotId: player.riotId,
				},
			])
			.sort(([a], [b]) => String(a).localeCompare(String(b))),
	});
}

export function RosterBuilder({ snapshot: initialSnapshot, initialVersion }: { snapshot: RosterSnapshot; initialVersion: number }) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [snapshot, setSnapshot] = useState<RosterSnapshot>(initialSnapshot);
	const [state, setState] = useState<State>(() => initialState(snapshot));
	const [picker, setPicker] = useState<null | {
		teamKey: string;
		role: PlayerRole;
	}>(null);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<null | {
		tone: "ok" | "error";
		text: string;
	}>(null);
	const [autoConfirm, setAutoConfirm] = useState(false);
	const [autoRunning, setAutoRunning] = useState(false);
	const [splitThreshold, setSplitThreshold] = useState(() => {
		if (typeof window === "undefined") return 35;
		const stored = localStorage.getItem("roster-balance-threshold");
		return stored ? Number(stored) || 35 : 35;
	});

	useEffect(() => {
		localStorage.setItem("roster-balance-threshold", String(splitThreshold));
	}, [splitThreshold]);
	const [balanceResult, setBalanceResult] = useState<BalanceResult | null>(null);
	const [editingRankId, setEditingRankId] = useState<string | null>(null);
	const [editingRankTier, setEditingRankTier] = useState("");
	const [editingRankDivision, setEditingRankDivision] = useState("");
	const [editingRankLp, setEditingRankLp] = useState("");
	const [seeding, setSeeding] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [pulseId, setPulseId] = useState<string | null>(null);
	const [sortMode, setSortMode] = useState<SortMode>("rank-desc");
	const [createOpen, setCreateOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const [newTeamName, setNewTeamName] = useState("");
	const [newTeamGroup, setNewTeamGroup] = useState<"A" | "B" | "">("");
	const [newTeamSeed, setNewTeamSeed] = useState<number | "">("");
	const [newTeamCreateDiscord, setNewTeamCreateDiscord] = useState(false);
	const [editTeamTarget, setEditTeamTarget] = useState<RosterTeam | null>(null);
	const [editingTeam, setEditingTeam] = useState(false);
	const [editTeamName, setEditTeamName] = useState("");
	const [editTeamGroup, setEditTeamGroup] = useState<"A" | "B" | "">("");
	const [editTeamSeed, setEditTeamSeed] = useState<number | "">("");
	const [deleteTeamTarget, setDeleteTeamTarget] = useState<RosterTeam | null>(null);
	const [deletingTeam, setDeletingTeam] = useState(false);
	const [manualSubOpen, setManualSubOpen] = useState(false);
	const [manualSubDiscordId, setManualSubDiscordId] = useState("");
	const [manualSubDiscordUsername, setManualSubDiscordUsername] = useState("");
	const [manualSubRiotId, setManualSubRiotId] = useState("");
	const [manualSubTeamKey, setManualSubTeamKey] = useState("");
	const [savedRosterState, setSavedRosterState] = useState(() => serializeRosterState(initialState(snapshot)));
	const currentRosterState = useMemo(() => serializeRosterState(state), [state]);
	const rosterDirty = currentRosterState !== savedRosterState;
	const createTeamDirty = Boolean(createOpen && (newTeamName.trim() || newTeamGroup || newTeamSeed !== "" || newTeamCreateDiscord));
	const editTeamDirty = Boolean(
		editTeamTarget && (editTeamName !== editTeamTarget.name || editTeamGroup !== (editTeamTarget.group ?? "") || editTeamSeed !== (editTeamTarget.seed ?? ""))
	);

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
			// role-available: applicants whose preferred role has an open slot float first
			sorted.sort((a, b) => {
				const aHas = a.preferredRoles.some((r) => {
					const role = normalizeRoleName(r);
					return role !== null && openRolesAnywhere.has(role);
				});
				const bHas = b.preferredRoles.some((r) => {
					const role = normalizeRoleName(r);
					return role !== null && openRolesAnywhere.has(role);
				});
				if (aHas !== bHas) return aHas ? -1 : 1;
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
		setVersion(json.version);
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
			displayName: discordUsername,
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
			text: `${discordUsername} wurde als nicht verifizierter Ersatzspieler vorgemerkt. Bitte das Roster speichern.`,
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
					? ` ${splitCount} Freundesgruppe(n) aufgeteilt` + (tooStrong > 0 ? ` (${tooStrong} zu stark)` : "") + (tooWeak > 0 ? ` (${tooWeak} zu schwach)` : "") + "."
					: " Freundesgruppen wurden zusammengehalten.") +
				" Prüfen und speichern, wenn alles passt.",
		});
	}

	const createTeam = useCallback(async (): Promise<boolean> => {
		const name = newTeamName.trim();
		if (!name || !newTeamGroup) {
			setMessage({
				tone: "error",
				text: "Teamname und Gruppe müssen ausgefüllt sein.",
			});
			return false;
		}
		setCreating(true);
		setMessage(null);
		const response = await fetch("/api/tournament/teams", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				expectedVersion: version,
				name,
				group: newTeamGroup,
				seed: newTeamSeed === "" ? undefined : newTeamSeed,
				createDiscordSetup: newTeamCreateDiscord,
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
		if (typeof json?.version === "number") setVersion(json.version);
		setNewTeamName("");
		setNewTeamGroup("");
		setNewTeamSeed("");
		setNewTeamCreateDiscord(false);
		setCreateOpen(false);
		const warnings = (json?.warnings as string[] | undefined) ?? [];
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text: [`Team "${json.name}" erstellt.`, ...warnings].join(" "),
		});
		router.refresh();
		return true;
	}, [newTeamName, newTeamGroup, newTeamSeed, newTeamCreateDiscord, version, router, showConflict]);

	const openEditTeam = useCallback((team: RosterTeam) => {
		setEditTeamTarget(team);
		setEditTeamName(team.name);
		setEditTeamGroup(team.group ?? "");
		setEditTeamSeed(team.seed ?? "");
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
		if (!name || !editTeamGroup) {
			setMessage({
				tone: "error",
				text: "Teamname und Gruppe müssen ausgefüllt sein.",
			});
			return false;
		}
		setEditingTeam(true);
		setMessage(null);
		const response = await fetch("/api/tournament/teams", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				expectedVersion: version,
				key: editTeamTarget.key,
				name,
				group: editTeamGroup,
				seed: editTeamSeed === "" ? undefined : editTeamSeed,
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
		if (typeof json?.version === "number") setVersion(json.version);
		setEditTeamTarget(null);
		const updateWarnings = (json?.warnings as string[] | undefined) ?? [];
		setMessage({
			tone: updateWarnings.length > 0 ? "error" : "ok",
			text: [`Team "${json.name}" aktualisiert.`, ...updateWarnings].join(" "),
		});
		router.refresh();
		return true;
	}, [editTeamTarget, editTeamName, editTeamGroup, editTeamSeed, version, router, showConflict]);

	async function performDeleteTeam() {
		if (!deleteTeamTarget) return;
		const team = deleteTeamTarget;
		setDeleteTeamTarget(null);
		setDeletingTeam(true);
		setMessage(null);
		const response = await fetch(`/api/tournament/teams?key=${encodeURIComponent(team.key)}&expectedVersion=${version}`, { method: "DELETE" });
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
		if (typeof json?.version === "number") setVersion(json.version);
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
		const warnings = (json?.warnings as string[] | undefined) ?? [];
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text: [`Team "${team.name}" gelöscht.`, ...warnings].join(" "),
		});
		router.refresh();
	}

	async function seedTestData() {
		setSeeding(true);
		setMessage(null);
		const response = await fetch("/api/tournament/test-data", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ count: 40, expectedVersion: version }),
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
		if (typeof json?.version === "number") setVersion(json.version);
		const parts: string[] = [];
		if (json.applicants) parts.push(`${json.applicants} Bewerber`);
		if (json.teamsInserted) parts.push(`${json.teamsInserted} Team(s) angelegt`);
		if (json.teamsAlreadyFull) parts.push("Teams sind bereits voll (8)");
		setMessage({
			tone: "ok",
			text: `Test-Daten gesetzt: ${parts.join(", ")}.`,
		});
		router.refresh();
	}

	async function clearTestData() {
		setClearing(true);
		setMessage(null);
		const response = await fetch("/api/tournament/test-data", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ expectedVersion: version }),
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
		if (typeof json?.version === "number") setVersion(json.version);
		const removedTeamKeys = new Set<string>(json.teamKeysRemoved ?? []);
		setState((previous) => {
			const assignments = new Map<string, Assignment>();
			for (const [discordId, assignment] of previous.assignments) {
				if (discordId.startsWith("test-")) continue;
				assignments.set(discordId, removedTeamKeys.has(assignment.teamKey) ? { teamKey: "", role: null } : assignment);
			}
			const captains = new Map<string, string | null>();
			for (const [teamKey, discordId] of previous.captains) {
				if (removedTeamKeys.has(teamKey)) continue;
				captains.set(teamKey, discordId?.startsWith("test-") ? null : discordId);
			}
			return { ...previous, assignments, captains };
		});
		const parts: string[] = [`${json.applications} Bewerbung(en)`, `${json.teamsRemoved} Team(s)`];
		if (json.playersStripped) parts.push(`${json.playersStripped} Dummy-Spieler aus echten Teams entfernt`);
		setMessage({
			tone: "ok",
			text: `Gelöscht: ${parts.join(", ")}.`,
		});
		router.refresh();
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
					riotId: player.riotId,
				},
			])
		);
		const response = await fetch("/api/tournament/roster", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				expectedVersion: version,
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
		if (typeof json?.version === "number") setVersion(json.version);
		setSavedRosterState(stateBeingSaved);
		const warnings = (json?.warnings as string[] | undefined) ?? [];
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text:
				`Roster gespeichert · ${json.applied} Spieler in ${json.teamsUpdated} Team(s).` +
				(warnings.length === 0 ? " Discord-Rollen wurden synchronisiert." : "") +
				(warnings.length > 0 ? ` Discord-Warnung: ${warnings.join(" · ")}` : ""),
		});
		return true;
	}, [currentRosterState, version, state, snapshot.teams, showConflict]);

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
		<div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
			<aside className="flex flex-col rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start">
				<div className="flex items-baseline justify-between">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">Nicht zugewiesen</div>
					<div className="text-xs font-bold text-emerald-100/52">{unassigned.length}</div>
				</div>
				<div
					className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-xl border border-cyan-200/16 bg-cyan-300/[0.07] px-3 py-2.5"
					title={`Interner Vergleichswert: ${applicantEloSummary.average?.toLocaleString("de-DE") ?? "keine Wertung"}`}
				>
					<div className="row-span-2 text-lg font-black text-cyan-50">{formatRankScore(applicantEloSummary.average)}</div>
					<div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/58">Bewerber Ø Rang</div>
					<div className="text-[9px] font-bold text-cyan-100/38">
						{applicantEloSummary.rated}/{applicantEloSummary.total} gewertet
					</div>
				</div>
				<div className="mt-3 flex flex-wrap gap-1">
					{SORT_OPTIONS.map((opt) => {
						const active = sortMode === opt.value;
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() => setSortMode(opt.value)}
								title={opt.title}
								className={`rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] transition ${
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
				<div className="mt-3 grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1">
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

			<main className="grid gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">Teams · {snapshot.teams.length}</div>
					<div className="flex flex-wrap items-center gap-2">
						{message ? (
							<div
								className={`rounded-xl border px-3 py-1.5 text-xs ${
									message.tone === "ok" ? "border-lime-200/30 bg-lime-200/10 text-lime-50" : "border-red-300/30 bg-red-500/10 text-red-100"
								}`}
							>
								{message.text}
							</div>
						) : null}
						<button
							type="button"
							onClick={() => setCreateOpen(true)}
							disabled={creating || autoRunning}
							title="Neues Team direkt im Bot anlegen (alternativ zum /createteam-Slash-Command)"
							className="rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100 disabled:opacity-50"
						>
							+ Team anlegen
						</button>
						<button
							type="button"
							onClick={() => openManualSubstituteDialog()}
							disabled={saving || autoRunning || snapshot.teams.length === 0}
							title="Einen Ersatzspieler ohne Website-Bewerbung manuell eintragen"
							className="rounded-xl border border-amber-200/24 bg-amber-200/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-200/44 hover:text-amber-50 disabled:opacity-50"
						>
							+ Manueller Ersatzspieler
						</button>
						<div className="flex items-center gap-2 rounded-xl border border-lime-200/20 bg-lime-200/[0.06] px-3 py-2">
							<label
								htmlFor="split-threshold"
								className="text-[10px] font-black uppercase tracking-[0.14em] text-lime-100/70 whitespace-nowrap"
								title="Maximale Abweichung des Gruppendurchschnitts vom Gesamtdurchschnitt. Gruppen, die zu stark oder zu schwach sind, werden aufgeteilt."
							>
								Balance-Schwelle
							</label>
							<input
								id="split-threshold"
								type="range"
								min={15}
								max={50}
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
							className="rounded-xl border border-lime-200/30 bg-lime-200/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-lime-50 transition hover:border-lime-200/60 disabled:opacity-50"
						>
							{autoRunning ? "Auto-Balance läuft…" : "⚡ Auto-Balance"}
						</button>
						<button
							type="button"
							onClick={save}
							disabled={saving || autoRunning}
							className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:opacity-60"
						>
							{saving ? "Speichern…" : "Roster speichern"}
						</button>
						<div className="h-5 w-px bg-white/10" />
						<button
							type="button"
							onClick={seedTestData}
							disabled={seeding || autoRunning}
							title="40 Dummy-Bewerber + Dummy-Teams einfügen, sodass insgesamt 8 Teams existieren (echte Teams bleiben unangetastet)"
							className="rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100 disabled:opacity-50"
						>
							{seeding ? "Wird angelegt…" : "+ Test-Daten"}
						</button>
						<button
							type="button"
							onClick={clearTestData}
							disabled={clearing || autoRunning}
							title="Alle mit isTestData:true markierten Bewerber + Teams löschen (echte Einträge bleiben)"
							className="rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-rose-200/30 hover:text-rose-200 disabled:opacity-50"
						>
							{clearing ? "Wird gelöscht…" : "Test-Daten löschen"}
						</button>
					</div>
				</div>

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
								<div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Aufgeteilte Gruppen</div>
								<div className="mt-2 space-y-1.5">
									{balanceResult.splitGroups.map((group) => (
										<div key={group.code} className="text-[11px] leading-4 text-amber-50/72">
											<span className="font-bold text-amber-100">{group.code}</span>
											{group.reason === "too_strong" ? (
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
								{preferenceGroups.length} Gruppen
							</span>
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

								return (
									<div key={code} className="rounded-2xl border border-white/9 bg-black/18 p-3">
										<div className="flex items-center justify-between gap-3">
											<PreferenceGroupBadge code={code} />
											<span className="text-[10px] font-black text-emerald-100/38">{members.length}/5</span>
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

				{snapshot.teams.length === 0 ? (
					<div className="rounded-[1.8rem] border border-amber-200/24 bg-amber-200/[0.08] p-6 text-sm leading-7 text-amber-50">
						Noch keine Teams im Bot. Lege oben über <strong className="font-black">„+ Team anlegen“</strong> dein erstes Team an oder erstelle sie via{" "}
						<code className="rounded bg-black/40 px-1.5 py-0.5">/createteam</code> in Discord.
					</div>
				) : null}

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
								<select
									value={manualSubTeamKey}
									onChange={(event) => setManualSubTeamKey(event.target.value)}
									className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-bold text-emerald-50 outline-none focus:border-lime-200/40"
								>
									{snapshot.teams.map((team) => (
										<option key={team.key} value={team.key} className="bg-emerald-950">
											{team.name}
										</option>
									))}
								</select>
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
						Das löscht jede aktuelle Zuweisung und verteilt nach Rang neu. Freundesgruppen werden zusammengehalten, sofern der durchschnittliche Skill der Gruppe nicht
						zu stark vom Gesamtdurchschnitt abweicht. Wunschrollen werden berücksichtigt, sofern der Slot frei ist.{" "}
						<strong className="text-emerald-50">Captains werden zurückgesetzt.</strong> Du kannst danach manuell anpassen, bevor du speicherst.
					</>
				}
				confirmLabel="Teams ausbalancieren"
				cancelLabel="Abbrechen"
				onConfirm={runAutoBalance}
				onCancel={() => setAutoConfirm(false)}
			/>

			{createOpen ? (
				<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center px-5">
					<button type="button" aria-label="Schließen" onClick={() => setCreateOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
					<div className="relative w-full max-w-md rounded-[1.7rem] border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-5 shadow-2xl shadow-black/40">
						<div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/72">Neues Team</div>
						<h2 className="mt-2 text-lg font-black text-emerald-50">Team anlegen</h2>
						<p className="mt-1 text-xs text-emerald-100/52">
							Wird direkt im Bot (bot_state.teams) gespeichert — gleicher Effekt wie der <code className="rounded bg-black/40 px-1 py-0.5">/createteam</code>
							-Befehl.
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

							<div className="grid grid-cols-2 gap-3">
								<label className="grid gap-1">
									<span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">Gruppe</span>
									<select
										value={newTeamGroup}
										onChange={(e) => setNewTeamGroup(e.target.value as "A" | "B" | "")}
										className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50"
									>
										<option value="">—</option>
										<option value="A">Gruppe A</option>
										<option value="B">Gruppe B</option>
									</select>
								</label>
								<label className="grid gap-1">
									<span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">Seed (optional)</span>
									<select
										value={newTeamSeed}
										onChange={(e) => setNewTeamSeed(e.target.value === "" ? "" : Number(e.target.value))}
										className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50"
									>
										<option value="">—</option>
										<option value="1">Seed 1</option>
										<option value="2">Seed 2</option>
										<option value="3">Seed 3</option>
										<option value="4">Seed 4</option>
									</select>
								</label>
							</div>
							<label className="flex gap-3 rounded-xl border border-white/10 bg-black/18 px-3 py-3 text-xs leading-5 text-emerald-100/70">
								<input
									type="checkbox"
									checked={newTeamCreateDiscord}
									onChange={(e) => setNewTeamCreateDiscord(e.target.checked)}
									className="mt-0.5 size-4 shrink-0 accent-lime-300"
								/>
								Discord-Rolle und privaten Voice-Channel wie bei /createteam anlegen.
							</label>
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
								disabled={creating || !newTeamName.trim() || !newTeamGroup}
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
							Name, Gruppe und Seed werden direkt in bot_state.teams aktualisiert. Falls Rolle oder Voice-Channel existieren, versucht die Website sie ebenfalls
							umzubenennen.
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

							<div className="grid grid-cols-2 gap-3">
								<label className="grid gap-1">
									<span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">Gruppe</span>
									<select
										value={editTeamGroup}
										onChange={(e) => setEditTeamGroup(e.target.value as "A" | "B" | "")}
										className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50"
									>
										<option value="">-</option>
										<option value="A">Gruppe A</option>
										<option value="B">Gruppe B</option>
									</select>
								</label>
								<label className="grid gap-1">
									<span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">Seed (optional)</span>
									<select
										value={editTeamSeed}
										onChange={(e) => setEditTeamSeed(e.target.value === "" ? "" : Number(e.target.value))}
										className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50"
									>
										<option value="">-</option>
										<option value="1">Seed 1</option>
										<option value="2">Seed 2</option>
										<option value="3">Seed 3</option>
										<option value="4">Seed 4</option>
									</select>
								</label>
							</div>
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
								disabled={editingTeam || !editTeamName.trim() || !editTeamGroup}
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

	return (
		<div
			className={`grid gap-2.5 rounded-xl border px-3 py-2.5 ${
				isCaptain ? "border-lime-200/40 bg-lime-200/10" : "border-white/10 bg-black/24"
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
					<select
						value={role}
						onChange={(event) => onSetRole(discordId, event.target.value as PlayerRole)}
						className="min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-lime-100 outline-none transition focus:border-lime-200/40"
					>
						{ALL_ROLES.map((r) => (
							<option key={r} value={r}>
								{r}
							</option>
						))}
					</select>
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
						<select
							value={editingTier}
							onChange={(e) => {
								const val = e.target.value;
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
							autoFocus
							className="rounded-lg border border-lime-200/40 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-lime-100 outline-none"
						>
							<option value="__reset__">Auto (Riot)</option>
							<option value="">Unranked</option>
							{RANK_TIERS.map((tier) => (
								<option key={tier} value={tier}>
									{tier}
								</option>
							))}
						</select>
						{editingTier && !APEX_TIERS.has(editingTier) ? (
							<select
								value={editingDivision}
								onChange={(e) => {
									onDivisionChange(e.target.value);
									onSaveRank(formatRankString(editingTier, e.target.value));
								}}
								className="rounded-lg border border-lime-200/40 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-lime-100 outline-none"
							>
								{RANK_DIVISIONS.map((div) => (
									<option key={div} value={div}>
										{div}
									</option>
								))}
							</select>
						) : null}
						{editingTier && APEX_TIERS.has(editingTier) ? (
							<>
								<input
									type="number"
									min={0}
									max={999}
									value={editingLp}
									onChange={(e) => onLpChange(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") onSaveRank(formatRankString(editingTier, undefined, Number(e.currentTarget.value) || undefined));
										if (e.key === "Escape") onSaveRank(formatRankString(editingTier, undefined, Number(e.currentTarget.value) || undefined));
									}}
									placeholder="LP"
									className="w-16 rounded-lg border border-lime-200/40 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-lime-100 outline-none"
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
				{applicant.preferredRoles.slice(0, 3).map((r) => (
					<span key={r} className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">
						{r}
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
						[applicant.mainRole ? `Main: ${applicant.mainRole}` : "", applicant.preferredRoles.length > 0 ? `Wunsch: ${applicant.preferredRoles.join(", ")}` : ""]
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
	// Mark applicants who preferred this role.
	const decorated = useMemo(
		() =>
			candidates
				.map((a) => ({
					applicant: a,
					preferred: a.preferredRoles.some((r) => r.toLowerCase() === role.toLowerCase()),
				}))
				.sort((a, b) => {
					if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
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
							{decorated.map(({ applicant, preferred }) => (
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
											{preferred ? <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.18em] text-lime-200/72">👍 Wunschrolle</span> : null}
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
							))}
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
