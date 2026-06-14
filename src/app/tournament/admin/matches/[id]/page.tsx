import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getChampionPools } from "@/lib/champion-pools";
import { getDraftState } from "@/lib/tournament-draft";
import { loadRosterSnapshot } from "@/lib/roster";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
} from "@/lib/tournament-storage";
import { findTeamByName, getMatchControlContext } from "@/lib/match-control";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { MatchControlRoomClient } from "./MatchControlRoomClient";

export default async function MatchControlRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    redirect("/tournament/admin");
  }

  const { id } = await params;
  const [ctx, pools, draft, roster, settings] = await Promise.all([
    getMatchControlContext(),
    getChampionPools(),
    getDraftState(id),
    loadRosterSnapshot(),
    getTournamentSettings(),
  ]);
  const match = ctx.matches.find((entry) => entry.id === id);
  if (!match) notFound();
  const groupRound = match.phase === "groups"
    ? /^[ab]-r(\d+)-\d+$/.exec(match.id)?.[1]
    : null;
  const parallelMatches = ctx.matches.filter((entry) =>
    entry.id !== match.id
    && entry.phase === match.phase
    && (
      groupRound
        ? /^[ab]-r(\d+)-\d+$/.exec(entry.id)?.[1] === groupRound
        : entry.round === match.round
    )
    && entry.teamAName
    && entry.teamBName,
  );

  return (
    <div className="px-5 py-6 sm:py-8">
      <section className="mx-auto w-full max-w-7xl">
        <MatchControlRoomClient
          match={match}
          teamA={findTeamByName(ctx.teams, match.teamAName)}
          teamB={findTeamByName(ctx.teams, match.teamBName)}
          pools={pools}
          draft={draft}
          extraBanSide={bonusBanSideForMatch(match)}
          roster={roster}
          draftEnabled={settings.draftEnabled}
          parallelMatches={parallelMatches}
        />
      </section>
    </div>
  );
}
