import { azLetterPools } from "@/lib/tournament-data";

export type WheelMatchAssignment = {
  matchId: string;
  teamAName: string;
  teamBName: string;
  teamAPool: string;
  teamBPool: string;
  spunAt: string;
  spunBy?: string;
};

export type TournamentWheelState = {
  id: string;
  currentAssignment: WheelMatchAssignment | null;
  usedPoolsByTeam: Record<string, string[]>;
  completedMatchIds: string[];
  history: WheelMatchAssignment[];
  updatedAt: string;
};

export function remainingPoolsForTeam(
  state: TournamentWheelState,
  teamName: string,
): string[] {
  const used = new Set(state.usedPoolsByTeam[teamName] ?? []);
  return azLetterPools.filter((pool) => !used.has(pool));
}

export function compactPoolLabel(pool: string): string {
  return pool
    .replace(/\s+und\s+/g, "/")
    .replace(/,\s*/g, "/")
    .replace(/\s+/g, "");
}

export function poolForChampion(championName: string): string | null {
  const first = championName.trim().charAt(0).toUpperCase();
  if (!first) return null;
  return azLetterPools.find((pool) => {
    if (pool.includes("-")) {
      const [start, end] = pool.split("-").map((part) => part.trim());
      return first >= start && first <= end;
    }

    const letters = pool
      .replace(/und/g, ",")
      .split(/[, ]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    return letters.includes(first);
  }) ?? null;
}

export function groupChampionsByPool(champions: string[]): Array<{
  pool: string;
  champions: string[];
}> {
  const grouped = new Map<string, string[]>();
  for (const champion of [...new Set(champions)].sort((a, b) => a.localeCompare(b))) {
    const pool = poolForChampion(champion) ?? "Unbekannt";
    grouped.set(pool, [...(grouped.get(pool) ?? []), champion]);
  }
  return [...grouped.entries()].map(([pool, groupedChampions]) => ({
    pool,
    champions: groupedChampions,
  }));
}
