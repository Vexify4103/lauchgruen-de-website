/**
 * Short team tags (2–5 characters, A–Z and 0–9), like Riot's "MKOI" for "Movistar KOI".
 * Teams get one automatically; captains can change it in the captain portal.
 */

export const TEAM_TAG_MIN = 2;
export const TEAM_TAG_MAX = 5;
const TAG_PATTERN = /^[A-Z0-9]{2,5}$/;

/** Uppercases and strips everything that is not A–Z or 0–9 (umlauts become AE/OE/UE). */
export function normalizeTeamTag(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/Ä/g, "AE")
		.replace(/Ö/g, "OE")
		.replace(/Ü/g, "UE")
		.replace(/ß/g, "SS")
		.normalize("NFKD")
		.replace(/[^A-Z0-9]/g, "");
}

export function isValidTeamTag(tag: string): boolean {
	return TAG_PATTERN.test(tag);
}

function words(name: string): string[] {
	return name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean);
}

/** Candidate tags for a name, best first. */
function candidates(name: string): string[] {
	const parts = words(name);
	if (parts.length === 0) return ["TEAM"];
	const upper = parts.map((part) => part.toUpperCase());
	const out: string[] = [];
	// Words that already look like a tag ("KOI", "FF15") stay whole; the rest give their initial.
	const keepsWhole = (part: string, upperPart: string) => part.length <= 4 && (part === upperPart || /\d/.test(part));
	if (parts.length === 1) {
		const word = upper[0];
		out.push(word.slice(0, 4));
		const consonants = word[0] + word.slice(1).replace(/[AEIOU]/g, "");
		out.push(consonants.slice(0, 4), word.slice(0, 3), word.slice(0, 5));
	} else {
		const mixed = parts.map((part, index) => (keepsWhole(part, upper[index]) ? upper[index] : upper[index][0])).join("");
		const initials = upper.map((part) => part[0]).join("");
		if (mixed.length >= 3 && mixed.length <= TEAM_TAG_MAX) out.push(mixed);
		if (initials.length >= 3) out.push(initials.slice(0, TEAM_TAG_MAX));
		// Two words: pad with more letters of the first word ("Report Jungler" -> "REJ").
		const head = upper[0];
		const rest = upper.slice(1).map((part) => part[0]).join("");
		for (let take = 2; take <= 4; take += 1) {
			const tag = head.slice(0, take) + rest;
			if (tag.length >= 3 && tag.length <= TEAM_TAG_MAX) out.push(tag);
		}
		out.push(initials.slice(0, TEAM_TAG_MAX));
	}
	return [...new Set(out.map(normalizeTeamTag).filter((tag) => tag.length >= TEAM_TAG_MIN && tag.length <= TEAM_TAG_MAX))];
}

/** Picks a tag for `name` that is not in `taken`; adds digits as a last resort. */
export function generateTeamTag(name: string, taken: Iterable<string> = []): string {
	const used = new Set([...taken].map((tag) => tag.toUpperCase()));
	const options = candidates(name);
	const free = options.find((tag) => !used.has(tag));
	if (free) return free;
	const base = (options[0] ?? "TEAM").slice(0, TEAM_TAG_MAX - 1);
	for (let index = 2; index < 100; index += 1) {
		const tag = `${base.slice(0, TEAM_TAG_MAX - String(index).length)}${index}`;
		if (!used.has(tag)) return tag;
	}
	return base;
}

/**
 * Fills in tags for teams without one. Stored tags win; the rest are generated in a stable
 * order (by storage key) so every page shows the same tag until one is saved.
 */
export function withTeamTags<T extends { name: string; storageKey?: string; meta?: { tag?: string } }>(teams: T[]): Map<T, string> {
	const result = new Map<T, string>();
	const taken = new Set<string>();
	for (const team of teams) {
		const stored = team.meta?.tag ? normalizeTeamTag(team.meta.tag) : "";
		if (isValidTeamTag(stored) && !taken.has(stored)) {
			result.set(team, stored);
			taken.add(stored);
		}
	}
	const rest = teams.filter((team) => !result.has(team)).sort((a, b) => (a.storageKey ?? a.name).localeCompare(b.storageKey ?? b.name));
	for (const team of rest) {
		const tag = generateTeamTag(team.name, taken);
		result.set(team, tag);
		taken.add(tag);
	}
	return result;
}

/** Distinct, readable team colors on the dark theme; pick by a stable team index. */
export const TEAM_COLORS = ["#a3e635", "#fbbf24", "#38bdf8", "#fb7185", "#c084fc", "#fb923c", "#2dd4bf", "#f472b6", "#facc15", "#60a5fa", "#4ade80", "#e879f9", "#f87171", "#22d3ee", "#fdba74", "#a78bfa"];

export function teamColor(index: number): string {
	return TEAM_COLORS[((index % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length];
}
