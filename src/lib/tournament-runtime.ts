/**
 * Runtime tournament context — pulls real teams from the Discord bot's Mongo
 * store and computes the group-stage match schedule from them.
 *
 * Falls back to the hardcoded placeholder roster in `tournament-data.ts` when
 * the bot has no teams yet, so dev / first-run / demo deployments still work.
 */

import { getDb } from "@/lib/mongo";
import { groupMatches as fallbackGroupMatches, teams as fallbackTeams, type GroupMatch, type TournamentPlayer, type TournamentTeam } from "@/lib/tournament-data";
import { groupRollingTime } from "@/lib/tournament-schedule";

// Mirror of the bot's StoredTeam shape — keep in sync with DiscordBot/src/types.ts.
type StoredPlayer = {
	riotId: string;
	puuid: string;
	discordId?: string;
	discordUsername?: string;
	role?: TournamentPlayer["role"];
	verificationStatus?: "verified" | "manual";
};

type TeamCaptainRef = {
	discordId: string;
	discordUsername?: string;
	riotId: string;
	puuid: string;
	assignedAt: string;
};

type TeamMeta = {
	group?: "A" | "B";
	seed?: number;
	accent?: string;
	/** Stable public identifier for URLs such as the OBS browser source. */
	overlayId?: string;
	captain?: TeamCaptainRef;
};

type StoredTeam = {
	name: string;
	players: StoredPlayer[];
	playedChampions: string[];
	roleId?: string;
	voiceChannelId?: string;
	textChannelId?: string;
	meta?: TeamMeta;
};

type BotStateDoc = {
	_id: string;
	teams?: Record<string, StoredTeam>;
};

const DEFAULT_ACCENTS = [
	"from-lime-300/24 via-emerald-400/12 to-cyan-400/10",
	"from-amber-300/24 via-orange-400/12 to-emerald-400/10",
	"from-yellow-200/22 via-lime-400/12 to-emerald-400/10",
	"from-rose-300/22 via-orange-400/12 to-amber-300/10",
	"from-sky-300/22 via-cyan-400/12 to-emerald-400/10",
	"from-fuchsia-300/18 via-rose-400/10 to-emerald-400/10",
	"from-red-300/22 via-rose-400/12 to-fuchsia-400/10",
	"from-orange-300/22 via-red-400/12 to-rose-400/10",
];

export type TournamentContext = {
	teams: TournamentTeam[];
	groupMatches: GroupMatch[];
	source: "bot" | "placeholder";
};

/**
 * Reads bot-managed teams from Mongo. Returns null if the bot collection is
 * empty or the connection fails.
 */
async function readBotTeams(): Promise<StoredTeam[] | null> {
	try {
		const db = await getDb();
		const doc = await db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" });
		const teamsObj = doc?.teams;
		if (!teamsObj) return null;
		const values = Object.values(teamsObj);
		return values.length > 0 ? values : null;
	} catch (error) {
		console.warn("[tournament-runtime] could not read bot teams:", error);
		return null;
	}
}

function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "")
			.slice(0, 60) || "team"
	);
}

function buildPlayer(p: StoredPlayer): TournamentPlayer {
	const encoded = encodeURIComponent(p.riotId.replace("#", "-"));
	return {
		name: p.riotId.split("#")[0] || p.riotId,
		// Role comes from the player's web application (preferredRoles[0]); we
		// only fall back to "Fill" when no role was supplied.
		role: p.role ?? "Fill",
		riotId: p.riotId,
		discordId: p.discordId,
		discordUsername: p.discordUsername,
		verified: p.verificationStatus !== "manual",
		opggUrl: `https://www.op.gg/summoners/euw/${encoded}`,
		dpmUrl: `https://dpm.lol/${encoded}`,
	};
}

/**
 * Assign default group/seed when admin hasn't set metadata yet:
 * - Round-robin teams alphabetically into groups A and B
 * - Seed by alphabetical index within group
 *
 * Once admin sets `meta.group` / `meta.seed` on the bot side, those override.
 */
function withDefaults(stored: StoredTeam[]): TournamentTeam[] {
	const sorted = [...stored].sort((a, b) => a.name.localeCompare(b.name));

	// First pass: respect explicit meta where present.
	const claimed = new Map<string, TournamentTeam>();
	const unclaimed: StoredTeam[] = [];
	for (const t of sorted) {
		if (t.meta?.group && t.meta?.seed) {
			claimed.set(`${t.meta.group}-${t.meta.seed}`, makeTeam(t, t.meta.group, t.meta.seed));
		} else {
			unclaimed.push(t);
		}
	}

	// Second pass: assign unclaimed teams to remaining (group, seed) slots in order.
	const slots: Array<{ group: "A" | "B"; seed: number }> = [];
	for (const group of ["A", "B"] as const) {
		for (let seed = 1; seed <= 4; seed += 1) {
			if (!claimed.has(`${group}-${seed}`)) slots.push({ group, seed });
		}
	}
	for (const team of unclaimed) {
		const slot = slots.shift();
		if (!slot) break; // more than 8 teams — drop extras silently for now
		claimed.set(`${slot.group}-${slot.seed}`, makeTeam(team, slot.group, slot.seed));
	}

	// Order by (group, seed) for stable presentation.
	return [...claimed.values()].sort((a, b) => {
		if (a.group !== b.group) return a.group < b.group ? -1 : 1;
		return a.seed - b.seed;
	});
}

const ROLE_DISPLAY_ORDER: Record<NonNullable<StoredPlayer["role"]>, number> = {
	Top: 0,
	Jungle: 1,
	Mid: 2,
	Bot: 3,
	Support: 4,
	Fill: 5,
	Sub: 6,
};

function sortPlayersByRole(players: StoredPlayer[]): StoredPlayer[] {
	return [...players].sort((a, b) => {
		const ai = a.role ? ROLE_DISPLAY_ORDER[a.role] : 99;
		const bi = b.role ? ROLE_DISPLAY_ORDER[b.role] : 99;
		if (ai !== bi) return ai - bi;
		return a.riotId.localeCompare(b.riotId);
	});
}

function resolveCaptainRef(stored: StoredTeam): TeamCaptainRef | undefined {
	const captainRef = stored.meta?.captain;
	if (!captainRef) return undefined;

	const captainPlayer = stored.players.find((player) => player.riotId.toLowerCase() === captainRef.riotId.toLowerCase());
	if (!captainPlayer?.discordId) return captainRef;

	return {
		...captainRef,
		discordId: captainPlayer.discordId,
		discordUsername: captainPlayer.discordUsername ?? captainRef.discordUsername,
		puuid: captainPlayer.puuid || captainRef.puuid,
	};
}

function makeTeam(stored: StoredTeam, group: "A" | "B", seed: number): TournamentTeam {
	const accentIndex = (group === "A" ? 0 : 4) + Math.min(3, Math.max(0, seed - 1));
	const captainRef = resolveCaptainRef(stored);
	const captainText = captainRef ? (captainRef.discordUsername ? `${captainRef.discordUsername} · ${captainRef.riotId}` : captainRef.riotId) : "Captain TBA";
	return {
		// Never derive public browser-source URLs from a mutable display name.
		// Legacy teams fall back to their current slug until their next rename.
		id: stored.meta?.overlayId ?? slugify(stored.name),
		name: stored.name,
		// Within-group seed (1–4). The overall cross-bracket seed (#1..#6) is a
		// separate concept computed by the resolver from group standings.
		seed,
		record: "0-0",
		group,
		captain: captainText,
		captainRef,
		discordRoleId: stored.roleId,
		accent: stored.meta?.accent ?? DEFAULT_ACCENTS[accentIndex],
		players: sortPlayersByRole(stored.players).map(buildPlayer),
		playedChampions: stored.playedChampions ?? [],
	};
}

/**
 * Build a double round-robin schedule for each four-team group. Every team
 * plays the other three teams twice. A slot contains one match from group A
 * and one from group B, so exactly two matches run in parallel.
 */
function buildGroupMatches(teams: TournamentTeam[]): GroupMatch[] {
	const out: GroupMatch[] = [];
	for (const group of ["A", "B"] as const) {
		const groupTeams = teams.filter((t) => t.group === group).sort((a, b) => a.seed - b.seed);
		if (groupTeams.length !== 4) continue;

		const rotation: Array<string | null> = groupTeams.map((team) => team.name);
		if (rotation.length % 2 !== 0) rotation.push(null);
		const rounds = rotation.length - 1;

		const firstLeg: Array<{ round: number; slot: number; teamA: string; teamB: string }> = [];
		for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
			let matchIndex = 0;
			for (let index = 0; index < rotation.length / 2; index += 1) {
				const teamA = rotation[index];
				const teamB = rotation[rotation.length - 1 - index];
				if (!teamA || !teamB) continue;
				matchIndex += 1;
				firstLeg.push({ round: roundIndex + 1, slot: matchIndex, teamA, teamB });
			}

			rotation.splice(1, 0, rotation.pop() ?? null);
		}

		for (const match of firstLeg) {
			out.push({
				id: `${group.toLowerCase()}-r${match.round}-${match.slot}`,
				group,
				round: `Runde ${match.round} · Slot ${match.slot}`,
				time: groupRollingTime(match.round),
				teamA: match.teamA,
				teamB: match.teamB,
				status: "Scheduled",
			});
		}
		for (const match of firstLeg) {
			const returnRound = match.round + rounds;
			out.push({
				id: `${group.toLowerCase()}-r${returnRound}-${match.slot}`,
				group,
				round: `Runde ${returnRound} · Slot ${match.slot}`,
				time: groupRollingTime(returnRound),
				teamA: match.teamB,
				teamB: match.teamA,
				status: "Scheduled",
			});
		}
	}
	return out;
}

/**
 * Single entry point used by every server-side consumer (pages, API routes,
 * resolver). Cached per-request via React's automatic dedup of identical
 * server-component work; we don't add explicit caching beyond that.
 */
export async function getTournamentContext(): Promise<TournamentContext> {
	const stored = await readBotTeams();
	if (!stored || stored.length === 0) {
		return {
			teams: fallbackTeams,
			groupMatches: fallbackGroupMatches,
			source: "placeholder",
		};
	}
	const teams = withDefaults(stored);
	const groupMatches = buildGroupMatches(teams);
	return { teams, groupMatches, source: "bot" };
}
