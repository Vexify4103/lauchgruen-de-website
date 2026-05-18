/**
 * Runtime tournament context — pulls real teams from the Discord bot's Mongo
 * store and computes the group-stage match schedule from them.
 *
 * Falls back to the hardcoded placeholder roster in `tournament-data.ts` when
 * the bot has no teams yet, so dev / first-run / demo deployments still work.
 */

import { getDb } from "@/lib/mongo";
import {
  groupMatches as fallbackGroupMatches,
  teams as fallbackTeams,
  type GroupMatch,
  type TournamentPlayer,
  type TournamentTeam,
} from "@/lib/tournament-data";

// Mirror of the bot's StoredTeam shape — keep in sync with DiscordBot/src/types.ts.
type StoredPlayer = {
  riotId: string;
  puuid: string;
  discordId?: string;
  role?: TournamentPlayer["role"];
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
  captain?: TeamCaptainRef;
};

type StoredTeam = {
  name: string;
  players: StoredPlayer[];
  playedChampions: string[];
  roleId?: string;
  voiceChannelId?: string;
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
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "team";
}

function buildPlayer(p: StoredPlayer): TournamentPlayer {
  const encoded = encodeURIComponent(p.riotId.replace("#", "-"));
  return {
    name: p.riotId.split("#")[0] || p.riotId,
    // Role comes from the player's web application (preferredRoles[0]); we
    // only fall back to "Fill" when no role was supplied.
    role: p.role ?? "Fill",
    riotId: p.riotId,
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

function makeTeam(
  stored: StoredTeam,
  group: "A" | "B",
  seed: number,
): TournamentTeam {
  const accentIndex =
    (group === "A" ? 0 : 4) + Math.min(3, Math.max(0, seed - 1));
  const captainRef = stored.meta?.captain;
  const captainText = captainRef
    ? captainRef.discordUsername
      ? `${captainRef.discordUsername} · ${captainRef.riotId}`
      : captainRef.riotId
    : "Captain TBA";
  return {
    id: slugify(stored.name),
    name: stored.name,
    // Within-group seed (1–4). The overall cross-bracket seed (#1..#6) is a
    // separate concept computed by the resolver from group standings.
    seed,
    record: "0-0",
    group,
    captain: captainText,
    captainRef,
    accent: stored.meta?.accent ?? DEFAULT_ACCENTS[accentIndex],
    players: sortPlayersByRole(stored.players).map(buildPlayer),
  };
}

/**
 * Build the round-robin schedule (6 matches per group) from a teams list.
 * Keeps the match-ID convention `<group>-r<round>-<n>` so existing stored
 * scores continue to map to the right matches.
 */
function buildGroupMatches(teams: TournamentTeam[]): GroupMatch[] {
  const out: GroupMatch[] = [];
  for (const group of ["A", "B"] as const) {
    const groupTeams = teams
      .filter((t) => t.group === group)
      .sort((a, b) => a.seed - b.seed);
    if (groupTeams.length !== 4) continue;
    const [t1, t2, t3, t4] = groupTeams.map((t) => t.name) as [
      string,
      string,
      string,
      string,
    ];
    const pairings: Array<[string, string]> = [
      [t1, t2],
      [t3, t4],
      [t1, t3],
      [t2, t4],
      [t1, t4],
      [t2, t3],
    ];
    pairings.forEach(([teamA, teamB], index) => {
      out.push({
        id: `${group.toLowerCase()}-r${Math.floor(index / 2) + 1}-${(index % 2) + 1}`,
        group,
        round: `Round ${Math.floor(index / 2) + 1}`,
        time: "TBA",
        teamA,
        teamB,
        status: "Scheduled",
      });
    });
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
