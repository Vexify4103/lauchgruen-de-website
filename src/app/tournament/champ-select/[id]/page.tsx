import { auth } from "@/lib/auth";
import { getChampionPools } from "@/lib/champion-pools";
import { getDraftState } from "@/lib/tournament-draft";
import { getMatchControlContext } from "@/lib/match-control";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { ChampSelectClient } from "./ChampSelectClient";

export default async function ChampSelectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, ctx, pools, draft, settings] = await Promise.all([
    auth(),
    getMatchControlContext(),
    getChampionPools(),
    getDraftState(id),
    getTournamentSettings(),
  ]);
  const match = ctx.matches.find((entry) => entry.id === id);
  if (!match) {
    return (
      <div className="px-5 py-10 sm:py-14">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-amber-200/18 bg-amber-200/8 p-6 text-amber-50">
          Match nicht gefunden.
        </section>
      </div>
    );
  }
  const discordId = session?.user?.discordId;
  const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
  if (!settings.draftEnabled && !isOwner) {
    return (
      <div className="px-5 py-10 sm:py-14">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-amber-200/18 bg-amber-200/8 p-6 text-amber-50">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/70">
            Champ Select pausiert
          </div>
          <h1 className="mt-3 text-3xl font-black">Draft ist aktuell deaktiviert.</h1>
          <p className="mt-3 text-sm leading-7 text-amber-50/72">
            Das Orga-Team hat Champ Select im Admin-Dashboard pausiert. Sobald
            er wieder aktiv ist, funktioniert diese Seite normal weiter.
          </p>
        </section>
      </div>
    );
  }

  const teamA = ctx.teams.find((team) => team.name === match.teamAName);
  const teamB = ctx.teams.find((team) => team.name === match.teamBName);
  const blueTeam = match.blueSide === "teamA" ? teamA : teamB;
  const redTeam = match.blueSide === "teamA" ? teamB : teamA;
  const editableSide =
    blueTeam?.captainRef?.discordId === discordId
      ? "teamA"
      : redTeam?.captainRef?.discordId === discordId
        ? "teamB"
        : null;
  const poolA = match.blueSide === "teamA"
    ? match.poolAssignment?.teamAPool
    : match.poolAssignment?.teamBPool;
  const poolB = match.blueSide === "teamA"
    ? match.poolAssignment?.teamBPool
    : match.poolAssignment?.teamAPool;

  return (
    <div className="px-3 py-3 sm:px-5 sm:py-4">
      <section className="mx-auto w-full max-w-[118rem]">
        <ChampSelectClient
          match={match}
          draft={draft}
          editableSide={editableSide}
          blueTeamLabel={blueTeam?.name ?? (match.blueSide === "teamA" ? match.teamALabel : match.teamBLabel)}
          redTeamLabel={redTeam?.name ?? (match.blueSide === "teamA" ? match.teamBLabel : match.teamALabel)}
          extraBanSide={bonusBanSideForMatch(match)}
          isOwner={isOwner}
          teamAChampions={poolA ? pools.find((pool) => pool.pool === poolA)?.champions ?? [] : []}
          teamBChampions={poolB ? pools.find((pool) => pool.pool === poolB)?.champions ?? [] : []}
        />
      </section>
    </div>
  );
}
