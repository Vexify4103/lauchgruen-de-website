/**
 * Convert a Riot rank string into a sortable numeric score.
 *
 * Format coming from league-v4 (via our verify endpoint):
 *   "DIAMOND II (45 LP)"  — has division
 *   "MASTER I (320 LP)"   — single-division apex tiers
 *   "Unranked"            — null currentRankAuto
 *
 * Score = tierBase + divisionBonus + LP.
 *   Each tier = 400 points.
 *   Each division (IV→I) adds 0/100/200/300.
 *   LP is added directly (caps the practical max within a division at ~100).
 *   Apex tiers (Master/GM/Challenger) have no divisions; LP determines order.
 *
 * Unranked sorts last (score 0). Garbage sorts last too.
 */

const TIER_BASE: Record<string, number> = {
	IRON: 0,
	BRONZE: 400,
	SILVER: 800,
	GOLD: 1200,
	PLATINUM: 1600,
	EMERALD: 2000,
	DIAMOND: 2400,
	MASTER: 2800,
	GRANDMASTER: 3200,
	CHALLENGER: 3600,
};

const DIVISION_BONUS: Record<string, number> = {
	IV: 0,
	III: 100,
	II: 200,
	I: 300,
};

export function parseRank(raw: string | null | undefined): number {
	if (!raw) return 0;
	const str = raw.trim().toUpperCase();
	if (str === "" || str === "UNRANKED") return 0;

	// e.g. "DIAMOND II (45 LP)"
	const match = str.match(/^([A-Z]+)\s+([IV]+)?\s*(?:\((\d+)\s*LP\))?/);
	if (!match) return 0;
	const tier = match[1];
	const division = match[2];
	const lp = Number.parseInt(match[3] ?? "0", 10) || 0;

	const base = TIER_BASE[tier];
	if (base === undefined) return 0;

	const div = division ? (DIVISION_BONUS[division] ?? 0) : 0;
	return base + div + lp;
}

const SCORE_TIERS = [
	"IRON",
	"BRONZE",
	"SILVER",
	"GOLD",
	"PLATINUM",
	"EMERALD",
	"DIAMOND",
] as const;

const SCORE_DIVISIONS = ["IV", "III", "II", "I"] as const;

/**
 * Turn the internal balancing score back into a rank players can understand.
 * The result is an estimate because it averages multiple individual ranks.
 */
export function formatRankScore(score: number | null | undefined): string {
	if (!score || score <= 0) return "Keine Wertung";
	if (score >= TIER_BASE.CHALLENGER) return "Challenger";
	if (score >= TIER_BASE.GRANDMASTER) return "Grandmaster";
	if (score >= TIER_BASE.MASTER) return "Master";

	const tierIndex = Math.min(
		SCORE_TIERS.length - 1,
		Math.floor(score / 400),
	);
	const pointsWithinTier = score - tierIndex * 400;
	const divisionIndex = Math.min(3, Math.floor(pointsWithinTier / 100));
	return `${SCORE_TIERS[tierIndex][0]}${SCORE_TIERS[tierIndex].slice(1).toLowerCase()} ${SCORE_DIVISIONS[divisionIndex]}`;
}
