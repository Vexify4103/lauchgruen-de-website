import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { formatRank, getAccountByPuuid, getLeagueEntriesByPuuid } from "@/lib/riot";
import { writeAuditLog } from "@/lib/tournament-audit";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  findApplication,
  listApplications,
  updateVerifiedAccountSnapshot,
  upsertApplication,
  type TournamentApplication,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFRESH_DELAY_MS = 2600;

const refreshSchema = z.object({
  id: z.string().trim().min(1).optional(),
});

type RefreshResult = {
  id: string;
  displayName: string;
  riotId: string;
  previousRiotId?: string;
  rank: string | null;
  ok: boolean;
  message?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshApplicationRank(app: TournamentApplication): Promise<RefreshResult> {
  try {
    const [account, entries] = await Promise.all([
      getAccountByPuuid(app.riotPuuid),
      getLeagueEntriesByPuuid(app.riotPuuid),
    ]);
    const currentRankAuto = formatRank(entries);
    const riotId = `${account.gameName}#${account.tagLine}`;
    const next: TournamentApplication = {
      ...app,
      riotId,
      currentRankAuto,
      updatedAt: new Date().toISOString(),
    };
    await Promise.all([
      upsertApplication(next),
      updateVerifiedAccountSnapshot(app.discordId, {
        riotId,
        gameName: account.gameName,
        tagLine: account.tagLine,
        currentRankAuto,
      }),
    ]);
    return {
      id: app.id,
      displayName: app.displayName,
      riotId,
      previousRiotId: app.riotId !== riotId ? app.riotId : undefined,
      rank: currentRankAuto,
      ok: true,
    };
  } catch (error) {
    return {
      id: app.id,
      displayName: app.displayName,
      riotId: app.riotId,
      rank: app.currentRankAuto,
      ok: false,
      message: error instanceof Error ? error.message : "Rank konnte nicht aktualisiert werden.",
    };
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Rank-Refresh-Daten." }, { status: 400 });
  }

  const applications = parsed.data.id
    ? [await findApplication(parsed.data.id)].filter((app): app is TournamentApplication => Boolean(app))
    : await listApplications();

  if (applications.length === 0) {
    return NextResponse.json({ message: "Keine Bewerbung gefunden.", results: [] }, { status: 404 });
  }

  const results: RefreshResult[] = [];
  for (let index = 0; index < applications.length; index += 1) {
    results.push(await refreshApplicationRank(applications[index]));
    if (index < applications.length - 1) {
      await sleep(REFRESH_DELAY_MS);
    }
  }

  const okCount = results.filter((result) => result.ok).length;
  const failCount = results.length - okCount;
  const renamedCount = results.filter((result) => result.previousRiotId).length;
  await writeAuditLog({
    action: parsed.data.id ? "rank.refresh_one" : "rank.refresh_all",
    targetType: "applications",
    targetId: parsed.data.id ?? "all",
    summary: `Ranks/Riot-IDs aktualisiert: ${okCount} ok, ${failCount} Fehler, ${renamedCount} Name-Updates.`,
    actorDiscordId: discordId,
    actorLabel: session.user.discordHandle ?? discordId,
    metadata: { okCount, failCount, renamedCount, count: results.length },
  });

  const rateLimited = results.some((result) => result.message?.includes("Rate-Limit"));
  return NextResponse.json(
    {
      ok: failCount === 0,
      okCount,
      failCount,
      renamedCount,
      delayMs: REFRESH_DELAY_MS,
      results,
    },
    { status: rateLimited ? 429 : 200 },
  );
}
