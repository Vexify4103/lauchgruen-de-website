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

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <MatchControlRoomClient
          match={match}
          teamA={findTeamByName(ctx.teams, match.teamAName)}
          teamB={findTeamByName(ctx.teams, match.teamBName)}
          pools={pools}
          draft={draft}
          extraBanSide={bonusBanSideForMatch(match)}
          roster={roster}
          tournamentLive={settings.tournamentLive}
          draftEnabled={settings.draftEnabled}
        />
      </section>
    </div>
  );
}
