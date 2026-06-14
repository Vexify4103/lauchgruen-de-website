import { TournamentLink as Link } from "../TournamentLink";
import { auth, signIn } from "@/lib/auth";
import { getChampionPools } from "@/lib/champion-pools";
import { findTeamByName, getMatchControlContext } from "@/lib/match-control";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { CopyDraftSpectatorLinkButton } from "./CopyDraftSpectatorLinkButton";
import { RenameTeamForm } from "./RenameTeamForm";

function opggMultiSearchUrl(riotIds: string[]) {
  const uniqueIds = [...new Set(riotIds.filter(Boolean))];
  const params = new URLSearchParams({
    summoners: uniqueIds.length > 0 ? `${uniqueIds.join(", ")},` : "",
  });
  return `https://op.gg/lol/multisearch/euw?${params.toString()}`;
}

export default async function CaptainPortalPage() {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    return (
      <div className="px-5 py-10 sm:py-14">
        <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-lime-200/12 bg-white/[0.045] p-6">
          <h1 className="text-3xl font-black text-emerald-50">Captain Portal</h1>
          <p className="mt-3 text-sm leading-7 text-emerald-100/64">
            Melde dich mit Discord an, damit wir dein Captain-Team erkennen können.
          </p>
          <form
            className="mt-5"
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: "/tournament/captain" });
            }}
          >
            <button className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950">
              Mit Discord anmelden
            </button>
          </form>
        </section>
      </div>
    );
  }

  const [ctx, pools, settings] = await Promise.all([
    getMatchControlContext(),
    getChampionPools(),
    getTournamentSettings(),
  ]);
  const team = ctx.teams.find((entry) => entry.captainRef?.discordId === discordId);
  if (!team) {
    return (
      <div className="px-5 py-10 sm:py-14">
        <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-amber-200/18 bg-amber-200/8 p-6">
          <h1 className="text-3xl font-black text-amber-50">Noch kein Captain-Team</h1>
          <p className="mt-3 text-sm leading-7 text-amber-50/72">
            Dein Discord-Account ist aktuell keinem Team als Captain zugeordnet.
            Wenn das falsch ist, bitte im Orga-Team melden.
          </p>
        </section>
      </div>
    );
  }

  const matches = ctx.matches.filter(
    (match) => match.teamAName === team.name || match.teamBName === team.name,
  );
  const nextMatch =
    matches.find((match) => match.status === "Live")
    ?? matches.find((match) => match.status !== "Finished")
    ?? matches[0]
    ?? null;
  const isTeamA = nextMatch?.teamAName === team.name;
  const assignedPool = nextMatch?.poolAssignment
    ? isTeamA
      ? nextMatch.poolAssignment.teamAPool
      : nextMatch.poolAssignment.teamBPool
    : null;
  const allowedPool = assignedPool
    ? pools.find((pool) => pool.pool === assignedPool)
    : null;
  const opponent = nextMatch
    ? findTeamByName(ctx.teams, isTeamA ? nextMatch.teamBName : nextMatch.teamAName)
    : null;

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-6">
          <div className={`rounded-[2rem] border border-white/10 bg-gradient-to-br ${team.accent} p-6 shadow-xl shadow-black/24`}>
            <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
              Captain Portal
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50">
              {team.name}
            </h1>
            <p className="mt-3 text-sm leading-7 text-emerald-100/68">
              Dein schneller Überblick für Match, Pool, Roster und nützliche Links.
            </p>
          </div>

          <RenameTeamForm
            teamKey={team.name.trim().toLowerCase()}
            initialName={team.name}
          />

          {nextMatch ? (
            <div className="rounded-[2rem] border border-lime-200/12 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
              <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
                Nächstes Match · {nextMatch.id}
              </div>
              <h2 className="mt-2 text-3xl font-black text-emerald-50">
                {team.name} vs {opponent?.name ?? (isTeamA ? nextMatch.teamBLabel : nextMatch.teamALabel)}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <InfoTile label="Status" value={nextMatch.status ?? "Scheduled"} />
                <InfoTile label="Score" value={nextMatch.scoreA !== undefined && nextMatch.scoreB !== undefined ? `${nextMatch.scoreA}:${nextMatch.scoreB}` : "TBA"} />
                <InfoTile label="Dein Pool" value={assignedPool ? compactPoolLabel(assignedPool) : "Noch offen"} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={opggMultiSearchUrl(team.players.map((player) => player.riotId))}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-white/12 bg-white/[0.045] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/72 hover:text-lime-100"
                >
                  Team OP.GG
                </a>
                {opponent ? (
                  <a
                    href={opggMultiSearchUrl(opponent.players.map((player) => player.riotId))}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-white/12 bg-white/[0.045] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/72 hover:text-lime-100"
                  >
                    Gegner OP.GG
                  </a>
                ) : null}
                {settings.draftEnabled ? (
                  <Link
                    href={`/tournament/champ-select/${nextMatch.id}`}
                    className="rounded-2xl bg-lime-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950"
                  >
                    Champ Select
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/30"
                  >
                    Champ Select pausiert
                  </span>
                )}
                <CopyDraftSpectatorLinkButton
                  matchId={nextMatch.id}
                  disabled={!settings.draftEnabled}
                />
              </div>
            </div>
          ) : null}

          {allowedPool ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
              <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
                Erlaubte Champions · Pool {allowedPool.label}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {allowedPool.champions.map((champion) => (
                  <span
                    key={champion.id}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-emerald-100/72"
                  >
                    {champion.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-[2rem] border border-white/10 bg-black/18 p-5 shadow-xl shadow-black/24">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
            Roster
          </div>
          <div className="mt-4 grid gap-2">
            {team.players.map((player) => (
              <div key={player.riotId} className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-200/58">
                  {player.role}
                </div>
                <div className="mt-1 truncate text-sm font-black text-emerald-50">{player.name}</div>
                <div className="truncate text-xs text-emerald-100/46">{player.riotId}</div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/42">
        {label}
      </div>
      <div className="mt-1 text-xl font-black text-lime-100">{value}</div>
    </div>
  );
}
