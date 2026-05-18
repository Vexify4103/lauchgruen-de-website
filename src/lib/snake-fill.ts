/**
 * Snake-draft auto-balance for the roster builder.
 *
 * Sorts applicants by rank (descending), then snake-distributes across teams
 * to keep total team strength roughly even:
 *
 *   Round 1:   T1 T2 T3 T4 T5 T6 T7 T8
 *   Round 2:   T8 T7 T6 T5 T4 T3 T2 T1
 *   Round 3:   T1 T2 T3 T4 T5 T6 T7 T8
 *   ...
 *
 * For each pick, the player's preferred role takes priority (if open on the
 * team). Falls back to any open core role (Top/Jng/Mid/Bot/Sup), then "Fill"
 * if every core slot is taken.
 *
 * Output is ordered the same way picks happen — RosterBuilder consumes this
 * as an animation queue, applying assignments one at a time.
 */

import { parseRank } from "@/lib/rank-score";
import type {
	PlayerRole,
	RosterApplicant,
	RosterTeam,
} from "@/lib/roster";

const CORE_ROLES: PlayerRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];
const OVERFLOW_ROLES: PlayerRole[] = ["Fill", "Sub"];

export type Assignment = {
	discordId: string;
	teamKey: string;
	role: PlayerRole;
};

function normalizeRoleName(raw: string): PlayerRole | null {
	const lower = raw.trim().toLowerCase();
	for (const role of [...CORE_ROLES, ...OVERFLOW_ROLES] as PlayerRole[]) {
		if (role.toLowerCase() === lower) return role;
	}
	// Common aliases
	if (lower === "adc" || lower === "bot lane" || lower === "botlane") return "Bot";
	if (lower === "jg" || lower === "jng" || lower === "jgl") return "Jungle";
	if (lower === "supp") return "Support";
	return null;
}

type TeamOpen = { core: Set<PlayerRole>; overflow: Set<PlayerRole> };

/**
 * Pick a slot for this applicant on this team. Strict two-phase rule:
 *
 *   1. Core lane slots (Top/Jng/Mid/Bot/Sup) MUST be filled first. While any
 *      core slot is open, this returns a core slot — preferring one the
 *      applicant listed in preferredRoles, falling back to any open core
 *      role in canonical order.
 *   2. Only once every core slot on this team is filled, can Fill/Sub get
 *      picked.
 *
 * This prevents the bug where an applicant preferring "Fill" claimed the
 * Fill slot before all 5 core roles were assigned (leaving Top/Jng empty).
 */
function pickRoleForTeam(
	applicant: RosterApplicant,
	open: TeamOpen,
): PlayerRole | null {
	// Phase 1: any core slot still open → MUST pick a core role.
	if (open.core.size > 0) {
		for (const raw of applicant.preferredRoles) {
			const role = normalizeRoleName(raw);
			if (role && CORE_ROLES.includes(role) && open.core.has(role)) {
				return role;
			}
		}
		for (const role of CORE_ROLES) {
			if (open.core.has(role)) return role;
		}
	}
	// Phase 2: core is full → overflow slots (Fill, then Sub).
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

export function snakeFillAssignments(
	applicants: RosterApplicant[],
	teams: RosterTeam[],
): Assignment[] {
	if (teams.length === 0 || applicants.length === 0) return [];

	const sorted = [...applicants].sort(
		(a, b) => parseRank(b.currentRank) - parseRank(a.currentRank),
	);

	const openByTeam = new Map<string, TeamOpen>();
	for (const team of teams) {
		openByTeam.set(team.key, {
			core: new Set(CORE_ROLES),
			overflow: new Set(OVERFLOW_ROLES),
		});
	}

	const assignments: Assignment[] = [];
	let cursor = 0;
	let round = 0;

	while (cursor < sorted.length) {
		const order = round % 2 === 0 ? teams : [...teams].reverse();

		for (const team of order) {
			if (cursor >= sorted.length) break;
			const open = openByTeam.get(team.key);
			if (!open || (open.core.size === 0 && open.overflow.size === 0)) continue;

			const applicant = sorted[cursor];
			const role = pickRoleForTeam(applicant, open);
			if (!role) continue;

			assignments.push({ discordId: applicant.discordId, teamKey: team.key, role });
			if (open.core.has(role)) open.core.delete(role);
			else open.overflow.delete(role);
			cursor += 1;
		}

		round += 1;
		if (
			[...openByTeam.values()].every(
				(o) => o.core.size === 0 && o.overflow.size === 0,
			)
		) {
			break;
		}
	}

	return assignments;
}
