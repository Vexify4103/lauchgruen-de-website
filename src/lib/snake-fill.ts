/**
 * Group-aware auto-balance for the roster builder.
 *
 * The important rule is: keep Wunschduos together first, then split only
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
	main: 0,
	preferenceStep: 4,
	flexible: 3,
	fillOverflow: 30,
	substitute: 40,
	offRole: 24,
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
	imputedApplicants: number;
	highEloPreferredAssignments: Array<{
		discordId: string;
		displayName: string;
		teamKey: string;
		role: PlayerRole;
		rank: string;
	}>;
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
	corePlayerCount: number;
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

type RolePlan = {
	assignments: Assignment[];
	rolePenalty: number;
	coreStrength: number;
	corePlayerCount: number;
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

function rawApplicantRank(applicant: RosterApplicant) {
	return applicant.manualRankOverride || applicant.currentRank;
}

function hasKnownRank(applicant: RosterApplicant) {
	const raw = rawApplicantRank(applicant)?.trim().toUpperCase();
	return Boolean(raw && raw !== "UNRANKED" && /^(IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND|MASTER|GRANDMASTER|CHALLENGER)\b/.test(raw));
}

function createStrengthMap(applicants: RosterApplicant[]) {
	const knownScores = applicants
		.filter(hasKnownRank)
		.map((applicant) => parseRank(rawApplicantRank(applicant)))
		.sort((a, b) => a - b);
	const median =
		knownScores.length === 0
			? 1200
			: knownScores.length % 2 === 1
				? knownScores[Math.floor(knownScores.length / 2)]
				: (knownScores[knownScores.length / 2 - 1] + knownScores[knownScores.length / 2]) / 2;
	return new Map(applicants.map((applicant) => [applicant.discordId, hasKnownRank(applicant) ? parseRank(rawApplicantRank(applicant)) : median]));
}

function applicantStrength(applicant: RosterApplicant, strengthById: Map<string, number>) {
	return strengthById.get(applicant.discordId) ?? 0;
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
		.filter((value): value is PlayerRole => value !== null)
		.filter((value, index, values) => values.indexOf(value) === index);
	const mainRole = applicant.mainRole ? normalizeRoleName(applicant.mainRole) : null;
	const preferredCore = normalizedPreferred.filter((value) => CORE_ROLES.includes(value));
	const fillPreferenceIndex = normalizedPreferred.indexOf("Fill");
	const hasFillPreference = fillPreferenceIndex >= 0 || mainRole === "Fill";
	const hasSubPreference = normalizedPreferred.includes("Sub") || mainRole === "Sub";

	if (CORE_ROLES.includes(role)) {
		const preferredIndex = normalizedPreferred.indexOf(role);
		if (preferredIndex >= 0) return preferredIndex * ROLE_PENALTY.preferenceStep;
		// "Fill" means: put me where a real team role is needed, not into the
		// artificial Fill/Sub bucket while core slots are still open.
		if (fillPreferenceIndex >= 0) return fillPreferenceIndex * ROLE_PENALTY.preferenceStep + 1;
		if (mainRole === role) return normalizedPreferred.length ? normalizedPreferred.length * ROLE_PENALTY.preferenceStep + 2 : ROLE_PENALTY.main;
		if (hasFillPreference && preferredCore.length === 0 && (!mainRole || mainRole === "Fill")) return ROLE_PENALTY.flexible;
	}

	if (role === "Fill") {
		return hasFillPreference ? ROLE_PENALTY.fillOverflow : ROLE_PENALTY.substitute;
	}

	if (role === "Sub") {
		const subIndex = normalizedPreferred.indexOf("Sub");
		return subIndex >= 0 ? subIndex * ROLE_PENALTY.preferenceStep : hasSubPreference ? ROLE_PENALTY.flexible : ROLE_PENALTY.substitute;
	}

	const wantedCore = new Set([...normalizedPreferred, mainRole].filter((value): value is PlayerRole => value !== null).filter((value) => CORE_ROLES.includes(value)));
	return wantedCore.size === 0 ? ROLE_PENALTY.flexible : ROLE_PENALTY.offRole;
}

function isRequestedCoreRole(applicant: RosterApplicant, role: PlayerRole) {
	if (!CORE_ROLES.includes(role)) return false;
	const mainRole = applicant.mainRole ? normalizeRoleName(applicant.mainRole) : null;
	const preferredRoles = applicant.preferredRoles.map(normalizeRoleName);
	return mainRole === role || preferredRoles.includes(role);
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

function createApplicantUnits(applicants: RosterApplicant[], strengthById: Map<string, number>): ApplicantUnit[] {
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
				const wantedDiff = applicantPreferredCoreRoles(a).length - applicantPreferredCoreRoles(b).length;
				if (wantedDiff !== 0) return wantedDiff;
				return applicantStrength(b, strengthById) - applicantStrength(a, strengthById);
			}),
			strength: unitApplicants.reduce((total, applicant) => total + applicantStrength(applicant, strengthById), 0),
			groupCode: code,
		}))
		.sort((a, b) => {
			if (b.strength !== a.strength) return b.strength - a.strength;
			return b.applicants.length - a.applicants.length;
		});
}

function deviationStats(teams: TeamBalance[], targetPlayerStrength: number, override?: { teamIndex: number; strength: number; corePlayerCount: number }) {
	const target = Math.max(1, targetPlayerStrength);
	const deviations = teams.flatMap((entry, index) => {
		const strength = override?.teamIndex === index ? override.strength : entry.strength;
		const corePlayerCount = override?.teamIndex === index ? override.corePlayerCount : entry.corePlayerCount;
		return corePlayerCount > 0 ? [Math.abs(strength / corePlayerCount - target) / target] : [];
	});
	if (deviations.length === 0) return { maxDeviation: 0, averageDeviation: 0 };
	return {
		maxDeviation: Math.max(...deviations),
		averageDeviation: deviations.reduce((total, value) => total + value, 0) / deviations.length,
	};
}

function roleAssignmentsForTeam(unit: ApplicantUnit, team: TeamBalance, strengthById: Map<string, number>): RolePlan | null {
	if (TEAM_CAPACITY - team.playerCount < unit.applicants.length) return null;

	let best: RolePlan | null = null;
	function visit(index: number, open: TeamOpen, assignments: Assignment[], penalty: number, coreStrength: number, corePlayerCount: number) {
		if (best && penalty >= best.rolePenalty) return;
		if (index === unit.applicants.length) {
			best = { assignments, rolePenalty: penalty, coreStrength, corePlayerCount };
			return;
		}

		const applicant = unit.applicants[index];
		const candidates = openRoleList(open).sort((a, b) => rolePenalty(applicant, a) - rolePenalty(applicant, b));
		for (const role of candidates) {
			const nextOpen = cloneOpen(open);
			removeOpenRole(nextOpen, role);
			const isCore = CORE_ROLES.includes(role);
			visit(
				index + 1,
				nextOpen,
				[...assignments, { discordId: applicant.discordId, teamKey: team.team.key, role }],
				penalty + rolePenalty(applicant, role),
				coreStrength + (isCore ? applicantStrength(applicant, strengthById) : 0),
				corePlayerCount + (isCore ? 1 : 0)
			);
		}
	}

	visit(0, cloneOpen(team.open), [], 0, 0, 0);
	return best;
}

function bestTeamPlan(unit: ApplicantUnit, teams: TeamBalance[], targetPlayerStrength: number, options: BalanceOptions, strengthById: Map<string, number>): TeamPlan | null {
	const plans = teams
		.map((team, teamIndex): TeamPlan | null => {
			const roles = roleAssignmentsForTeam(unit, team, strengthById);
			if (!roles) return null;
			const projectedStrength = team.strength + roles.coreStrength;
			const stats = deviationStats(teams, targetPlayerStrength, {
				teamIndex,
				strength: projectedStrength,
				corePlayerCount: team.corePlayerCount + roles.corePlayerCount,
			});
			const thresholdExcess = Math.max(0, stats.maxDeviation - options.splitThreshold);
			const score =
				stats.averageDeviation * 15000 + stats.maxDeviation * 8000 + thresholdExcess * 18000 + roles.rolePenalty * 260 + team.playerCount * 30 + team.index * 0.01;
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
		corePlayerCount: entry.corePlayerCount,
	}));
}

function applyAssignments(teams: TeamBalance[], assignments: Assignment[], applicantById: Map<string, RosterApplicant>, strengthById: Map<string, number>) {
	for (const assignment of assignments) {
		const team = teams.find((entry) => entry.team.key === assignment.teamKey);
		const applicant = applicantById.get(assignment.discordId);
		if (!team || !applicant) continue;
		removeOpenRole(team.open, assignment.role);
		team.playerCount += 1;
		if (CORE_ROLES.includes(assignment.role)) {
			team.corePlayerCount += 1;
			team.strength += applicantStrength(applicant, strengthById);
		}
	}
}

function simulateSplitPlan(
	unit: ApplicantUnit,
	teams: TeamBalance[],
	targetPlayerStrength: number,
	options: BalanceOptions,
	applicantById: Map<string, RosterApplicant>,
	strengthById: Map<string, number>
): SplitPlan | null {
	const simulatedTeams = cloneTeams(teams);
	const assignments: Assignment[] = [];
	let rolePenaltyTotal = 0;

	for (const applicant of [...unit.applicants].sort((a, b) => applicantStrength(b, strengthById) - applicantStrength(a, strengthById))) {
		const singleUnit: ApplicantUnit = {
			applicants: [applicant],
			strength: applicantStrength(applicant, strengthById),
		};
		const plan = bestTeamPlan(singleUnit, simulatedTeams, targetPlayerStrength, options, strengthById);
		if (!plan) return null;
		assignments.push(...plan.assignments);
		rolePenaltyTotal += plan.rolePenalty;
		applyAssignments(simulatedTeams, plan.assignments, applicantById, strengthById);
	}

	const stats = deviationStats(simulatedTeams, targetPlayerStrength);
	return {
		assignments,
		rolePenalty: rolePenaltyTotal,
		maxDeviation: stats.maxDeviation,
		averageDeviation: stats.averageDeviation,
	};
}

function splitReason(unit: ApplicantUnit, intact: TeamPlan | null, split: SplitPlan | null, overallAverage: number): SplitGroupInfo["reason"] {
	if (!intact) return "capacity";
	if (split && split.rolePenalty + ROLE_PENALTY.offRole < intact.rolePenalty) {
		return "role_conflict";
	}
	const groupAverage = unit.strength / unit.applicants.length;
	return groupAverage > overallAverage ? "too_strong" : "too_weak";
}

function recordSplitGroup(unit: ApplicantUnit, assignments: Assignment[], overallAverage: number, reason: SplitGroupInfo["reason"]): SplitGroupInfo {
	const keptTeam = assignments[0]?.teamKey;
	const kept = assignments.filter((assignment) => assignment.teamKey === keptTeam).map((assignment) => assignment.discordId);
	const moved = assignments.filter((assignment) => assignment.teamKey !== keptTeam).map((assignment) => assignment.discordId);
	const groupAverage = unit.strength / unit.applicants.length;
	const deviation = overallAverage > 0 ? Math.abs(groupAverage - overallAverage) / overallAverage : 0;

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

function shouldSplitGroup(intact: TeamPlan | null, split: SplitPlan | null, options: BalanceOptions) {
	if (!split) return false;
	if (!intact) return true;

	const intactTooUneven = intact.maxDeviation > options.splitThreshold;
	const splitMeaningfullyFairer = split.maxDeviation <= intact.maxDeviation - 0.06;
	const splitMuchBetterRoles = split.rolePenalty + ROLE_PENALTY.offRole < intact.rolePenalty;
	return (intactTooUneven && splitMeaningfullyFairer) || splitMuchBetterRoles;
}

function optimizeStarterSwaps(assignments: Assignment[], applicantById: Map<string, RosterApplicant>, strengthById: Map<string, number>, teamKeys: string[]) {
	const teamStrengths = new Map(teamKeys.map((teamKey) => [teamKey, 0]));
	for (const assignment of assignments) {
		if (!CORE_ROLES.includes(assignment.role)) continue;
		teamStrengths.set(assignment.teamKey, (teamStrengths.get(assignment.teamKey) ?? 0) + (strengthById.get(assignment.discordId) ?? 0));
	}
	const target = [...teamStrengths.values()].reduce((sum, strength) => sum + strength, 0) / Math.max(1, teamKeys.length);
	const candidates = assignments.filter((assignment) => CORE_ROLES.includes(assignment.role) && !applicantById.get(assignment.discordId)?.preferenceGroupCode);

	for (let pass = 0; pass < 50; pass += 1) {
		let best: { left: Assignment; right: Assignment; improvement: number } | null = null;
		for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
			for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
				const left = candidates[leftIndex];
				const right = candidates[rightIndex];
				if (left.teamKey === right.teamKey || left.role !== right.role) continue;
				const leftStrength = strengthById.get(left.discordId) ?? 0;
				const rightStrength = strengthById.get(right.discordId) ?? 0;
				const leftTeamStrength = teamStrengths.get(left.teamKey) ?? 0;
				const rightTeamStrength = teamStrengths.get(right.teamKey) ?? 0;
				const before = (leftTeamStrength - target) ** 2 + (rightTeamStrength - target) ** 2;
				const after = (leftTeamStrength - leftStrength + rightStrength - target) ** 2 + (rightTeamStrength - rightStrength + leftStrength - target) ** 2;
				const improvement = before - after;
				if (improvement > 0.01 && (!best || improvement > best.improvement)) best = { left, right, improvement };
			}
		}
		if (!best) break;
		const leftTeamKey = best.left.teamKey;
		const rightTeamKey = best.right.teamKey;
		const leftStrength = strengthById.get(best.left.discordId) ?? 0;
		const rightStrength = strengthById.get(best.right.discordId) ?? 0;
		teamStrengths.set(leftTeamKey, (teamStrengths.get(leftTeamKey) ?? 0) - leftStrength + rightStrength);
		teamStrengths.set(rightTeamKey, (teamStrengths.get(rightTeamKey) ?? 0) - rightStrength + leftStrength);
		best.left.teamKey = rightTeamKey;
		best.right.teamKey = leftTeamKey;
	}

	return teamStrengths;
}

export function snakeFillAssignments(applicants: RosterApplicant[], teams: RosterTeam[], options?: Partial<BalanceOptions>): BalanceResult {
	if (teams.length === 0 || applicants.length === 0) {
		return {
			assignments: [],
			splitGroups: [],
			teamStrengths: teams.map((team) => ({ teamKey: team.key, strength: 0 })),
			overallAverage: 0,
			imputedApplicants: 0,
			highEloPreferredAssignments: [],
		};
	}

	const opts = { ...DEFAULT_BALANCE_OPTIONS, ...options };
	const strengthById = createStrengthMap(applicants);
	const totalStrength = applicants.reduce((sum, applicant) => sum + applicantStrength(applicant, strengthById), 0);
	const overallAverage = totalStrength / applicants.length;
	const starterCount = Math.min(applicants.length, teams.length * CORE_ROLES.length);
	const starterStrength = [...strengthById.values()]
		.sort((a, b) => b - a)
		.slice(0, starterCount)
		.reduce((sum, strength) => sum + strength, 0);
	const targetPlayerStrength = starterStrength / Math.max(1, starterCount);
	const units = createApplicantUnits(applicants, strengthById);
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
		corePlayerCount: 0,
	}));
	const assignments: Assignment[] = [];
	const splitGroups: SplitGroupInfo[] = [];

	for (const unit of units) {
		const isPreferenceGroup = Boolean(unit.groupCode && unit.applicants.length >= 2);
		const intact = bestTeamPlan(unit, teamBalances, targetPlayerStrength, opts, strengthById);

		if (isPreferenceGroup && unit.applicants.length > MAX_AUTOBALANCE_FRIEND_GROUP_SIZE) {
			const split = simulateSplitPlan(unit, teamBalances, targetPlayerStrength, opts, applicantById, strengthById);
			if (split) {
				assignments.push(...split.assignments);
				applyAssignments(teamBalances, split.assignments, applicantById, strengthById);
				splitGroups.push(recordSplitGroup(unit, split.assignments, overallAverage, "capacity"));
			}
			continue;
		}

		if (isPreferenceGroup) {
			const split = simulateSplitPlan(unit, teamBalances, targetPlayerStrength, opts, applicantById, strengthById);
			if (shouldSplitGroup(intact, split, opts) && split) {
				assignments.push(...split.assignments);
				applyAssignments(teamBalances, split.assignments, applicantById, strengthById);
				splitGroups.push(recordSplitGroup(unit, split.assignments, overallAverage, splitReason(unit, intact, split, overallAverage)));
				continue;
			}
		}

		if (intact) {
			assignments.push(...intact.assignments);
			applyAssignments(teamBalances, intact.assignments, applicantById, strengthById);
			continue;
		}

		const split = simulateSplitPlan(unit, teamBalances, targetPlayerStrength, opts, applicantById, strengthById);
		if (split) {
			assignments.push(...split.assignments);
			applyAssignments(teamBalances, split.assignments, applicantById, strengthById);
			if (isPreferenceGroup) {
				splitGroups.push(recordSplitGroup(unit, split.assignments, overallAverage, "capacity"));
			}
		}
	}

	const optimizedStrengths = optimizeStarterSwaps(
		assignments,
		applicantById,
		strengthById,
		teams.map((team) => team.key)
	);
	const highEloPreferredAssignments = assignments.flatMap((assignment) => {
		const applicant = applicantById.get(assignment.discordId);
		const rank = applicant ? rawApplicantRank(applicant) : null;
		if (!applicant || !rank || !hasKnownRank(applicant) || parseRank(rank) < 2800 || !isRequestedCoreRole(applicant, assignment.role)) return [];
		return [
			{
				discordId: applicant.discordId,
				displayName: applicant.displayName,
				teamKey: assignment.teamKey,
				role: assignment.role,
				rank,
			},
		];
	});
	return {
		assignments,
		splitGroups,
		teamStrengths: teamBalances.map((team) => ({
			teamKey: team.team.key,
			strength: optimizedStrengths.get(team.team.key) ?? 0,
		})),
		overallAverage,
		imputedApplicants: applicants.filter((applicant) => !hasKnownRank(applicant)).length,
		highEloPreferredAssignments,
	};
}
