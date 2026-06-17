/**
 * Group-aware auto-balance for the roster builder.
 *
 * Friend groups are kept together whenever a team has enough free slots,
 * UNLESS the group's average individual strength deviates from the overall
 * average by more than a configurable threshold — in that case the group
 * is split. This catches both overpowered stacks (5 Diamonds) and
 * underpowered stacks (5 Silvers) that would create unbalanced teams.
 *
 * Split strategy: keep 2 for groups of 2–3, keep 3 for groups of 4+.
 * Groups with more than 5 members are excluded and require manual admin.
 *
 * Units are assigned strongest-first to the currently weakest team.
 * Within a team, preferred roles are used when possible before falling
 * back to another open core role and finally Fill/Sub.
 */

import { parseRank } from "@/lib/rank-score";
import type { PlayerRole, RosterApplicant, RosterTeam } from "@/lib/roster";

const CORE_ROLES: PlayerRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];
const OVERFLOW_ROLES: PlayerRole[] = ["Fill", "Sub"];
const TEAM_CAPACITY = CORE_ROLES.length + OVERFLOW_ROLES.length;
export const MAX_AUTOBALANCE_FRIEND_GROUP_SIZE = 5;

export type BalanceOptions = {
	/** 0.0–1.0. Maximum allowed deviation of a group's average individual
	 *  strength from the overall average. Groups exceeding this in either
	 *  direction (too strong OR too weak) will be split.
	 *  Default: 0.35 (35%). */
	splitThreshold: number;
};

export const DEFAULT_BALANCE_OPTIONS: BalanceOptions = {
	splitThreshold: 0.35,
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
	reason: "too_strong" | "too_weak";
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

function normalizeRoleName(raw: string): PlayerRole | null {
	const lower = raw.trim().toLowerCase();
	for (const role of [...CORE_ROLES, ...OVERFLOW_ROLES] as PlayerRole[]) {
		if (role.toLowerCase() === lower) return role;
	}
	if (lower === "adc" || lower === "bot lane" || lower === "botlane") return "Bot";
	if (lower === "jg" || lower === "jng" || lower === "jgl") return "Jungle";
	if (lower === "supp") return "Support";
	return null;
}

function pickRoleForTeam(applicant: RosterApplicant, open: TeamOpen): PlayerRole | null {
	if (open.core.size > 0) {
		for (const raw of applicant.preferredRoles) {
			const role = normalizeRoleName(raw);
			if (role && CORE_ROLES.includes(role) && open.core.has(role)) {
				return role;
			}
		}
		const mainRole = applicant.mainRole ? normalizeRoleName(applicant.mainRole) : null;
		if (mainRole && CORE_ROLES.includes(mainRole) && open.core.has(mainRole)) {
			return mainRole;
		}
		for (const role of CORE_ROLES) {
			if (open.core.has(role)) return role;
		}
	}

	if (open.overflow.size > 0) {
		for (const raw of applicant.preferredRoles) {
			const role = normalizeRoleName(raw);
			if (role && OVERFLOW_ROLES.includes(role) && open.overflow.has(role)) {
				return role;
			}
		}
		for (const role of OVERFLOW_ROLES) {
			if (open.overflow.has(role)) return role;
		}
	}
	return null;
}

function applicantStrength(applicant: RosterApplicant) {
	return parseRank(applicant.manualRankOverride || applicant.currentRank);
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
			applicants: [...unitApplicants].sort((a, b) => applicantStrength(b) - applicantStrength(a)),
			strength: unitApplicants.reduce((total, applicant) => total + applicantStrength(applicant), 0),
			groupCode: code,
		}))
		.sort((a, b) => {
			if (b.strength !== a.strength) return b.strength - a.strength;
			return b.applicants.length - a.applicants.length;
		});
}

function weakestAvailableTeam(teams: TeamBalance[], requiredSlots: number): TeamBalance | null {
	return (
		teams
			.filter((entry) => TEAM_CAPACITY - entry.playerCount >= requiredSlots)
			.sort((a, b) => {
				if (a.strength !== b.strength) return a.strength - b.strength;
				if (a.playerCount !== b.playerCount) return a.playerCount - b.playerCount;
				return a.index - b.index;
			})[0] ?? null
	);
}

function assignApplicant(applicant: RosterApplicant, target: TeamBalance, assignments: Assignment[]) {
	const role = pickRoleForTeam(applicant, target.open);
	if (!role) return false;

	assignments.push({
		discordId: applicant.discordId,
		teamKey: target.team.key,
		role,
	});
	if (target.open.core.has(role)) target.open.core.delete(role);
	else target.open.overflow.delete(role);
	target.playerCount += 1;
	target.strength += applicantStrength(applicant);
	return true;
}

export function snakeFillAssignments(applicants: RosterApplicant[], teams: RosterTeam[], options?: Partial<BalanceOptions>): BalanceResult {
	if (teams.length === 0 || applicants.length === 0) {
		return {
			assignments: [],
			splitGroups: [],
			teamStrengths: teams.map((t) => ({ teamKey: t.key, strength: 0 })),
			overallAverage: 0,
		};
	}

	const opts = { ...DEFAULT_BALANCE_OPTIONS, ...options };
	const totalStrength = applicants.reduce((sum, a) => sum + applicantStrength(a), 0);
	const overallAverage = totalStrength / applicants.length;

	const rawUnits = createApplicantUnits(applicants);
	const units: ApplicantUnit[] = [];
	const splitGroups: SplitGroupInfo[] = [];

	for (const unit of rawUnits) {
		const isMultiGroup = unit.groupCode && unit.applicants.length >= 2;
		let shouldSplit = false;
		let reason: "too_strong" | "too_weak" = "too_strong";

		if (isMultiGroup && overallAverage > 0) {
			const groupAverage = unit.strength / unit.applicants.length;
			const deviation = Math.abs(groupAverage - overallAverage) / overallAverage;
			if (deviation > opts.splitThreshold) {
				shouldSplit = true;
				reason = groupAverage > overallAverage ? "too_strong" : "too_weak";
			}
		}

		if (shouldSplit) {
			const keepCount = unit.applicants.length <= 3 ? 2 : 3;
			const kept = unit.applicants.slice(0, keepCount);
			const moved = unit.applicants.slice(keepCount);
			const groupAverage = unit.strength / unit.applicants.length;

			units.push({
				applicants: kept,
				strength: kept.reduce((s, a) => s + applicantStrength(a), 0),
				groupCode: unit.groupCode,
			});

			for (const applicant of moved) {
				units.push({
					applicants: [applicant],
					strength: applicantStrength(applicant),
				});
			}

			splitGroups.push({
				code: unit.groupCode!,
				kept: kept.map((a) => a.discordId),
				moved: moved.map((a) => a.discordId),
				groupStrength: unit.strength,
				groupAverage,
				overallAverage,
				deviation: Math.abs(groupAverage - overallAverage) / overallAverage,
				reason,
			});
		} else {
			units.push(unit);
		}
	}

	units.sort((a, b) => {
		if (b.strength !== a.strength) return b.strength - a.strength;
		return b.applicants.length - a.applicants.length;
	});

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

	for (const unit of units) {
		const groupTarget = weakestAvailableTeam(teamBalances, unit.applicants.length);

		if (groupTarget) {
			for (const applicant of unit.applicants) {
				assignApplicant(applicant, groupTarget, assignments);
			}
			continue;
		}

		for (const applicant of unit.applicants) {
			const target = weakestAvailableTeam(teamBalances, 1);
			if (!target) break;
			assignApplicant(applicant, target, assignments);
		}
	}

	return {
		assignments,
		splitGroups,
		teamStrengths: teamBalances.map((tb) => ({
			teamKey: tb.team.key,
			strength: tb.strength,
		})),
		overallAverage,
	};
}
