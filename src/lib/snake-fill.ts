/**
 * Group-aware auto-balance for the roster builder.
 *
 * Friend groups of up to three players are placed together whenever a team
 * has enough free slots. Groups with four or five members require an explicit
 * admin decision and must be filtered out by the caller. Units are assigned
 * strongest-first to the currently weakest team. Within a team, preferred
 * roles are used when possible before falling back to another open core role
 * and finally Fill/Sub.
 */

import { parseRank } from "@/lib/rank-score";
import type {
  PlayerRole,
  RosterApplicant,
  RosterTeam,
} from "@/lib/roster";

const CORE_ROLES: PlayerRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];
const OVERFLOW_ROLES: PlayerRole[] = ["Fill", "Sub"];
const TEAM_CAPACITY = CORE_ROLES.length + OVERFLOW_ROLES.length;
export const MAX_AUTOBALANCE_FRIEND_GROUP_SIZE = 3;

export type Assignment = {
  discordId: string;
  teamKey: string;
  role: PlayerRole;
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

function pickRoleForTeam(
  applicant: RosterApplicant,
  open: TeamOpen,
): PlayerRole | null {
  if (open.core.size > 0) {
    for (const raw of applicant.preferredRoles) {
      const role = normalizeRoleName(raw);
      if (role && CORE_ROLES.includes(role) && open.core.has(role)) {
        return role;
      }
    }
    const mainRole = applicant.mainRole
      ? normalizeRoleName(applicant.mainRole)
      : null;
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
  return parseRank(applicant.currentRank);
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
    ...grouped.values(),
    ...singles.map((applicant) => [applicant]),
  ]
    .map((unitApplicants) => ({
      applicants: [...unitApplicants].sort(
        (a, b) => applicantStrength(b) - applicantStrength(a),
      ),
      strength: unitApplicants.reduce(
        (total, applicant) => total + applicantStrength(applicant),
        0,
      ),
    }))
    .sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;
      return b.applicants.length - a.applicants.length;
    });
}

function weakestAvailableTeam(
  teams: TeamBalance[],
  requiredSlots: number,
): TeamBalance | null {
  return teams
    .filter((entry) => TEAM_CAPACITY - entry.playerCount >= requiredSlots)
    .sort((a, b) => {
      if (a.strength !== b.strength) return a.strength - b.strength;
      if (a.playerCount !== b.playerCount) return a.playerCount - b.playerCount;
      return a.index - b.index;
    })[0] ?? null;
}

function assignApplicant(
  applicant: RosterApplicant,
  target: TeamBalance,
  assignments: Assignment[],
) {
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

export function snakeFillAssignments(
  applicants: RosterApplicant[],
  teams: RosterTeam[],
): Assignment[] {
  if (teams.length === 0 || applicants.length === 0) return [];

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

  for (const unit of createApplicantUnits(applicants)) {
    const groupTarget = weakestAvailableTeam(
      teamBalances,
      unit.applicants.length,
    );

    if (groupTarget) {
      for (const applicant of unit.applicants) {
        assignApplicant(applicant, groupTarget, assignments);
      }
      continue;
    }

    // A complete placement no longer fits. Split only as a last resort.
    for (const applicant of unit.applicants) {
      const target = weakestAvailableTeam(teamBalances, 1);
      if (!target) return assignments;
      assignApplicant(applicant, target, assignments);
    }
  }

  return assignments;
}
