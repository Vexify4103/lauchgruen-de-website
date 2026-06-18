/**
 * Group-aware auto-balance for the roster builder.
 *
 * The important rule is: keep Wunschgruppen together first, then split only
 * when the shared placement would create a clearly unfair team or force too
 * many players onto roles they did not ask for.
 */

import { parseRank } from "@/lib/rank-score";
import type { PlayerRole, RosterApplicant, RosterTeam } from "@/lib/roster";

const CORE_ROLES: PlayerRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];
const OVERFLOW_ROLES: PlayerRole[] = ["Fill", "Sub"];
const ALL_BALANCE_ROLES: PlayerRole[] = [...CORE_ROLES, ...OVERFLOW_ROLES];
const TEAM_CAPACITY = ALL_BALANCE_ROLES.length;
export const MAX_AUTOBALANCE_FRIEND_GROUP_SIZE = 5;

const ROLE_PENALTY = {
	preferred: 0,
	main: 1,
	flexible: 3,
	fillOverflow: 30,
	substitute: 40,
	offRole: 16,
} as const;

export type BalanceOptions = {
	/**
	 * 0.0-1.0. Maximum desired deviation of a team from the target team
	 * strength. Groups are only split if keeping them together would exceed
	 * this noticeably or would cause much worse role assignments.
	 */
	splitThreshold: number;
};

export const DEFAULT_BALANCE_OPTIONS: BalanceOptions = {
	splitThreshold: 0.22,
};

export type Assignment = {
	discordId: string;
	teamKey: string;
	role: PlayerRole;
};

export type SplitGroupInfo = {
	code: string;
	kept: string[];
	moved: string[];
	groupStrength: number;
	groupAverage: number;
	overallAverage: number;
	deviation: number;
	reason: "too_strong" | "too_weak" | "role_conflict" | "capacity";
};

export type BalanceResult = {
	assignments: Assignment[];
	splitGroups: SplitGroupInfo[];
	teamStrengths: Array<{ teamKey: string; strength: number }>;
	overallAverage: number;
};

type TeamOpen = {
	core: Set<PlayerRole>;
	overflow: Set<PlayerRole>;
};

type TeamBalance = {
	team: RosterTeam;
	index: number;
	open: TeamOpen;
	strength: number;
	playerCount: number;
};

type ApplicantUnit = {
	applicants: RosterApplicant[];
	strength: number;
	groupCode?: string;
};

type TeamPlan = {
	team: TeamBalance;
	assignments: Assignment[];
	rolePenalty: number;
	maxDeviation: number;
	averageDeviation: number;
	score: number;
};

type SplitPlan = {
	assignments: Assignment[];
	rolePenalty: number;
	maxDeviation: number;
	averageDeviation: number;
};

function normalizeRoleName(raw: string): PlayerRole | null {
	const lower = raw.trim().toLowerCase();
	for (const role of ALL_BALANCE_ROLES) {
		if (role.toLowerCase() === lower) return role;
	}
	if (lower === "adc" || lower === "bot lane" || lower === "botlane") return "Bot";
	if (lower === "jg" || lower === "jng" || lower === "jgl") return "Jungle";
	if (lower === "supp") return "Support";
	return null;
}

function applicantStrength(applicant: RosterApplicant) {
	return parseRank(applicant.manualRankOverride || applicant.currentRank);
}

function applicantPreferredCoreRoles(applicant: RosterApplicant): PlayerRole[] {
	const roles = new Set<PlayerRole>();
	for (const raw of applicant.preferredRoles) {
		const role = normalizeRoleName(raw);
		if (role && CORE_ROLES.includes(role)) roles.add(role);
	}
	const mainRole = applicant.mainRole ? normalizeRoleName(applicant.mainRole) : null;
	if (mainRole && CORE_ROLES.includes(mainRole)) roles.add(mainRole);
	return [...roles];
}

function rolePenalty(applicant: RosterApplicant, role: PlayerRole): number {
	const normalizedPreferred = applicant.preferredRoles
		.map(normalizeRoleName)
		.filter((value): value is PlayerRole => value !== null);
	const mainRole = applicant.mainRole ? normalizeRoleName(applicant.mainRole) : null;
	const preferredCore = normalizedPreferred.filter((value) => CORE_ROLES.includes(value));
	const hasFillPreference =
		normalizedPreferred.includes("Fill") || mainRole === "Fill";
	const hasSubPreference =
		normalizedPreferred.includes("Sub") || mainRole === "Sub";

	if (CORE_ROLES.includes(role)) {
		if (normalizedPreferred.includes(role)) return ROLE_PENALTY.preferred;
		if (mainRole === role) return ROLE_PENALTY.main;
		// "Fill" means: put me where a real team role is needed, not into the
		// artificial Fill/Sub bucket while core slots are still open.
		if (hasFillPreference && preferredCore.length === 0 && (!mainRole || mainRole === "Fill")) {
			return ROLE_PENALTY.preferred;
		}
	}

	if (role === "Fill") {
		return hasFillPreference ? ROLE_PENALTY.fillOverflow : ROLE_PENALTY.substitute;
	}

	if (role === "Sub") {
		return hasSubPreference ? ROLE_PENALTY.preferred : ROLE_PENALTY.substitute;
	}

	const wantedCore = new Set(
		[...normalizedPreferred, mainRole]
			.filter((value): value is PlayerRole => value !== null)
			.filter((value) => CORE_ROLES.includes(value)),
	);
	return wantedCore.size === 0 ? ROLE_PENALTY.flexible : ROLE_PENALTY.offRole;
}

function openRoleList(open: TeamOpen): PlayerRole[] {
	return [...open.core, ...open.overflow];
}

function cloneOpen(open: TeamOpen): TeamOpen {
	return {
		core: new Set(open.core),
		overflow: new Set(open.overflow),
	};
}

function removeOpenRole(open: TeamOpen, role: PlayerRole) {
	if (open.core.has(role)) open.core.delete(role);
	else open.overflow.delete(role);
}

function createApplicantUnits(applicants: RosterApplicant[]): ApplicantUnit[] {
	const grouped = new Map<string, RosterApplicant[]>();
	const singles: RosterApplicant[] = [];

	for (const applicant of applicants) {
		if (!applicant.preferenceGroupCode) {
			singles.push(applicant);
			continue;
		}
		const members = grouped.get(applicant.preferenceGroupCode) ?? [];
		members.push(applicant);
		grouped.set(applicant.preferenceGroupCode, members);
	}

	return [
		...[...grouped.entries()].map(([code, members]) => ({
			applicants: members,
			code,
		})),
		...singles.map((applicant) => ({ applicants: [applicant], code: undefined })),
	]
		.map(({ applicants: unitApplicants, code }) => ({
			applicants: [...unitApplicants].sort((a, b) => {
				const wantedDiff =
					applicantPreferredCoreRoles(a).length
					- applicantPreferredCoreRoles(b).length;
				if (wantedDiff !== 0) return wantedDiff;
				return applicantStrength(b) - applicantStrength(a);
			}),
			strength: unitApplicants.reduce((total, applicant) => total + applicantStrength(applicant), 0),
			groupCode: code,
		}))
		.sort((a, b) => {
			if (b.strength !== a.strength) return b.strength - a.strength;
			return b.applicants.length - a.applicants.length;
		});
}

function deviationStats(
	teams: TeamBalance[],
	targetTeamStrength: number,
	override?: { teamIndex: number; strength: number },
) {
	const target = Math.max(1, targetTeamStrength);
	const deviations = teams.map((entry, index) =>
		Math.abs((override?.teamIndex === index ? override.strength : entry.strength) - target) / target,
	);
	return {
		maxDeviation: Math.max(...deviations),
		averageDeviation: deviations.reduce((total, value) => total + value, 0) / deviations.length,
	};
}

function roleAssignmentsForTeam(
	unit: ApplicantUnit,
	team: TeamBalance,
): { assignments: Assignment[]; rolePenalty: number } | null {
	if (TEAM_CAPACITY - team.playerCount < unit.applicants.length) return null;

	const open = cloneOpen(team.open);
	const assignments: Assignment[] = [];
	let totalPenalty = 0;

	for (const applicant of unit.applicants) {
		const role = openRoleList(open)
			.map((candidate) => ({
				role: candidate,
				penalty: rolePenalty(applicant, candidate),
				core: CORE_ROLES.includes(candidate),
			}))
			.sort((a, b) => {
				if (a.penalty !== b.penalty) return a.penalty - b.penalty;
				if (a.core !== b.core) return a.core ? -1 : 1;
				return CORE_ROLES.indexOf(a.role) - CORE_ROLES.indexOf(b.role);
			})[0];

		if (!role) return null;
		totalPenalty += role.penalty;
		assignments.push({
			discordId: applicant.discordId,
			teamKey: team.team.key,
			role: role.role,
		});
		removeOpenRole(open, role.role);
	}

	return { assignments, rolePenalty: totalPenalty };
}

function bestTeamPlan(
	unit: ApplicantUnit,
	teams: TeamBalance[],
	targetTeamStrength: number,
	options: BalanceOptions,
): TeamPlan | null {
	const plans = teams
		.map((team, teamIndex): TeamPlan | null => {
			const roles = roleAssignmentsForTeam(unit, team);
			if (!roles) return null;
			const projectedStrength = team.strength + unit.strength;
			const stats = deviationStats(teams, targetTeamStrength, {
				teamIndex,
				strength: projectedStrength,
			});
			const thresholdExcess = Math.max(0, stats.maxDeviation - options.splitThreshold);
			const score =
				stats.averageDeviation * 15000
				+ stats.maxDeviation * 8000
				+ thresholdExcess * 18000
				+ roles.rolePenalty * 260
				+ team.playerCount * 30
				+ team.index * 0.01;
			return {
				team,
				assignments: roles.assignments,
				rolePenalty: roles.rolePenalty,
				maxDeviation: stats.maxDeviation,
				averageDeviation: stats.averageDeviation,
				score,
			};
		})
		.filter((plan): plan is TeamPlan => plan !== null);

	return plans.sort((a, b) => a.score - b.score)[0] ?? null;
}

function cloneTeams(teams: TeamBalance[]): TeamBalance[] {
	return teams.map((entry) => ({
		team: entry.team,
		index: entry.index,
		open: cloneOpen(entry.open),
		strength: entry.strength,
		playerCount: entry.playerCount,
	}));
}

function applyAssignments(
	teams: TeamBalance[],
	assignments: Assignment[],
	applicantById: Map<string, RosterApplicant>,
) {
	for (const assignment of assignments) {
		const team = teams.find((entry) => entry.team.key === assignment.teamKey);
		const applicant = applicantById.get(assignment.discordId);
		if (!team || !applicant) continue;
		removeOpenRole(team.open, assignment.role);
		team.playerCount += 1;
		team.strength += applicantStrength(applicant);
	}
}

function simulateSplitPlan(
	unit: ApplicantUnit,
	teams: TeamBalance[],
	targetTeamStrength: number,
	options: BalanceOptions,
	applicantById: Map<string, RosterApplicant>,
): SplitPlan | null {
	const simulatedTeams = cloneTeams(teams);
	const assignments: Assignment[] = [];
	let rolePenaltyTotal = 0;

	for (const applicant of [...unit.applicants].sort((a, b) => applicantStrength(b) - applicantStrength(a))) {
		const singleUnit: ApplicantUnit = {
			applicants: [applicant],
			strength: applicantStrength(applicant),
		};
		const plan = bestTeamPlan(singleUnit, simulatedTeams, targetTeamStrength, options);
		if (!plan) return null;
		assignments.push(...plan.assignments);
		rolePenaltyTotal += plan.rolePenalty;
		applyAssignments(simulatedTeams, plan.assignments, applicantById);
	}

	const stats = deviationStats(simulatedTeams, targetTeamStrength);
	return {
		assignments,
		rolePenalty: rolePenaltyTotal,
		maxDeviation: stats.maxDeviation,
		averageDeviation: stats.averageDeviation,
	};
}

function splitReason(
	unit: ApplicantUnit,
	intact: TeamPlan | null,
	split: SplitPlan | null,
	overallAverage: number,
): SplitGroupInfo["reason"] {
	if (!intact) return "capacity";
	if (split && split.rolePenalty + ROLE_PENALTY.offRole < intact.rolePenalty) {
		return "role_conflict";
	}
	const groupAverage = unit.strength / unit.applicants.length;
	return groupAverage > overallAverage ? "too_strong" : "too_weak";
}

function recordSplitGroup(
	unit: ApplicantUnit,
	assignments: Assignment[],
	overallAverage: number,
	reason: SplitGroupInfo["reason"],
): SplitGroupInfo {
	const keptTeam = assignments[0]?.teamKey;
	const kept = assignments
		.filter((assignment) => assignment.teamKey === keptTeam)
		.map((assignment) => assignment.discordId);
	const moved = assignments
		.filter((assignment) => assignment.teamKey !== keptTeam)
		.map((assignment) => assignment.discordId);
	const groupAverage = unit.strength / unit.applicants.length;
	const deviation = overallAverage > 0
		? Math.abs(groupAverage - overallAverage) / overallAverage
		: 0;

	return {
		code: unit.groupCode!,
		kept,
		moved,
		groupStrength: unit.strength,
		groupAverage,
		overallAverage,
		deviation,
		reason,
	};
}

function shouldSplitGroup(
	intact: TeamPlan | null,
	split: SplitPlan | null,
	options: BalanceOptions,
) {
	if (!split) return false;
	if (!intact) return true;

	const intactTooUneven = intact.maxDeviation > options.splitThreshold;
	const splitMeaningfullyFairer = split.maxDeviation <= intact.maxDeviation - 0.06;
	const splitMuchBetterRoles = split.rolePenalty + ROLE_PENALTY.offRole < intact.rolePenalty;
	return (intactTooUneven && splitMeaningfullyFairer) || splitMuchBetterRoles;
}

export function snakeFillAssignments(
	applicants: RosterApplicant[],
	teams: RosterTeam[],
	options?: Partial<BalanceOptions>,
): BalanceResult {
	if (teams.length === 0 || applicants.length === 0) {
		return {
			assignments: [],
			splitGroups: [],
			teamStrengths: teams.map((team) => ({ teamKey: team.key, strength: 0 })),
			overallAverage: 0,
		};
	}

	const opts = { ...DEFAULT_BALANCE_OPTIONS, ...options };
	const totalStrength = applicants.reduce((sum, applicant) => sum + applicantStrength(applicant), 0);
	const overallAverage = totalStrength / applicants.length;
	const targetTeamStrength = totalStrength / teams.length;
	const units = createApplicantUnits(applicants);
	const applicantById = new Map(applicants.map((applicant) => [applicant.discordId, applicant]));
	const teamBalances: TeamBalance[] = teams.map((team, index) => ({
		team,
		index,
		open: {
			core: new Set(CORE_ROLES),
			overflow: new Set(OVERFLOW_ROLES),
		},
		strength: 0,
		playerCount: 0,
	}));
	const assignments: Assignment[] = [];
	const splitGroups: SplitGroupInfo[] = [];

	for (const unit of units) {
		const isPreferenceGroup = Boolean(unit.groupCode && unit.applicants.length >= 2);
		const intact = bestTeamPlan(unit, teamBalances, targetTeamStrength, opts);

		if (isPreferenceGroup && unit.applicants.length > MAX_AUTOBALANCE_FRIEND_GROUP_SIZE) {
			const split = simulateSplitPlan(unit, teamBalances, targetTeamStrength, opts, applicantById);
			if (split) {
				assignments.push(...split.assignments);
				applyAssignments(teamBalances, split.assignments, applicantById);
				splitGroups.push(recordSplitGroup(unit, split.assignments, overallAverage, "capacity"));
			}
			continue;
		}

		if (isPreferenceGroup) {
			const split = simulateSplitPlan(unit, teamBalances, targetTeamStrength, opts, applicantById);
			if (shouldSplitGroup(intact, split, opts) && split) {
				assignments.push(...split.assignments);
				applyAssignments(teamBalances, split.assignments, applicantById);
				splitGroups.push(recordSplitGroup(unit, split.assignments, overallAverage, splitReason(unit, intact, split, overallAverage)));
				continue;
			}
		}

		if (intact) {
			assignments.push(...intact.assignments);
			applyAssignments(teamBalances, intact.assignments, applicantById);
			continue;
		}

		const split = simulateSplitPlan(unit, teamBalances, targetTeamStrength, opts, applicantById);
		if (split) {
			assignments.push(...split.assignments);
			applyAssignments(teamBalances, split.assignments, applicantById);
			if (isPreferenceGroup) {
				splitGroups.push(recordSplitGroup(unit, split.assignments, overallAverage, "capacity"));
			}
		}
	}

	return {
		assignments,
		splitGroups,
		teamStrengths: teamBalances.map((team) => ({
			teamKey: team.team.key,
			strength: team.strength,
		})),
		overallAverage,
	};
}
