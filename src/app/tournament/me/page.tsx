import Link from "next/link";
import type { ReactNode } from "react";
import { auth, signIn } from "@/lib/auth";
import { DISCORD_INVITE_URL, isDiscordGuildMember } from "@/lib/discord";
import { findTeamByName, getMatchControlContext } from "@/lib/match-control";
import { getVerifiedAccount, listApplications } from "@/lib/tournament-storage";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";

export default async function TournamentMePage() {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    return (
      <Shell>
        <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-lime-200/12 bg-white/[0.045] p-6">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Mein Status
          </div>
          <h1 className="mt-3 text-3xl font-black text-emerald-50">
            Bitte mit Discord anmelden.
          </h1>
          <p className="mt-3 text-sm leading-7 text-emerald-100/64">
            Danach zeigen wir dir, ob deine Bewerbung, Discord-Mitgliedschaft,
            Riot-Verifizierung und Teamzuweisung bereit sind.
          </p>
          <form
            className="mt-5"
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: "/tournament/me" });
            }}
          >
            <button className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950">
              Mit Discord anmelden
            </button>
          </form>
        </section>
      </Shell>
    );
  }

  const [verified, applications, member, ctx] = await Promise.all([
    getVerifiedAccount(discordId),
    listApplications(),
    isDiscordGuildMember(discordId),
    getMatchControlContext(),
  ]);
  const application = applications.find((entry) => entry.discordId === discordId) ?? null;
  const team = ctx.teams.find((entry) =>
    entry.players.some((player) => player.riotId.toLowerCase() === application?.riotId.toLowerCase())
      || entry.captainRef?.discordId === discordId,
  ) ?? null;
  const isCaptain = team?.captainRef?.discordId === discordId;
  const matches = team
    ? ctx.matches.filter((match) => match.teamAName === team.name || match.teamBName === team.name)
    : [];
  const nextMatch =
    matches.find((match) => match.status === "Live")
    ?? matches.find((match) => match.status !== "Finished")
    ?? null;
  const isTeamA = nextMatch?.teamAName === team?.name;
  const opponent = nextMatch
    ? findTeamByName(ctx.teams, isTeamA ? nextMatch.teamBName : nextMatch.teamAName)
    : null;
  const pool = nextMatch?.poolAssignment
    ? isTeamA
      ? nextMatch.poolAssignment.teamAPool
      : nextMatch.poolAssignment.teamBPool
    : null;

  const checks = [
    {
      label: "Discord angemeldet",
      ok: true,
      detail: session.user.discordHandle ?? discordId,
    },
    {
      label: "Auf dem Server",
      ok: member !== false,
      detail: member === false ? "Bitte dem Discord beitreten" : "Mitgliedschaft erkannt",
    },
    {
      label: "Riot verifiziert",
      ok: Boolean(verified),
      detail: verified?.riotId ?? "Noch kein Riot-Account verifiziert",
    },
    {
      label: "Bewerbung gespeichert",
      ok: Boolean(application),
      detail: application ? `Anzeigename: ${application.displayName}` : "Noch keine Bewerbung",
    },
    {
      label: "Team zugewiesen",
      ok: Boolean(team),
      detail: team?.name ?? "Noch kein Team",
    },
    {
      label: "Captain",
      ok: Boolean(isCaptain),
      detail: isCaptain ? "Du bist Captain" : "Kein Captain-Status",
    },
  ];

  return (
    <Shell>
      <section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-6">
          <div className="rounded-[2rem] border border-lime-200/12 bg-gradient-to-br from-lime-200/12 via-emerald-400/8 to-cyan-400/8 p-6 shadow-xl shadow-black/24">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
              Mein Status
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50">
              {application?.displayName ?? session.user.discordHandle ?? "Teilnehmer"}
            </h1>
            <p className="mt-3 text-sm leading-7 text-emerald-100/68">
              Dein persönlicher Turnier-Check: Bewerbung, Riot, Discord, Team und
              nächstes Match an einem Ort.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {checks.map((check) => (
              <div
                key={check.label}
                className={`rounded-2xl border p-4 ${
                  check.ok
                    ? "border-lime-200/18 bg-lime-200/8"
                    : "border-amber-200/18 bg-amber-200/8"
                }`}
              >
                <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                  check.ok ? "text-lime-100/70" : "text-amber-100/70"
                }`}>
                  {check.ok ? "OK" : "Offen"}
                </div>
                <div className="mt-1 text-sm font-black text-emerald-50">{check.label}</div>
                <div className="mt-1 text-xs leading-5 text-emerald-100/50">{check.detail}</div>
              </div>
            ))}
          </div>

          {nextMatch ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
              <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
                Nächstes Match · {nextMatch.id}
              </div>
              <h2 className="mt-2 text-3xl font-black text-emerald-50">
                {team?.name} vs {opponent?.name ?? (isTeamA ? nextMatch.teamBLabel : nextMatch.teamALabel)}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Info label="Status" value={nextMatch.status ?? "Scheduled"} />
                <Info label="Zeit" value={`${nextMatch.round} · ${nextMatch.time}`} />
                <Info label="Dein Pool" value={pool ? compactPoolLabel(pool) : "Noch offen"} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {pool ? (
                  <Link
                    href={`/tournament/champ-select/${nextMatch.id}/spectate`}
                    className="rounded-2xl border border-sky-200/20 bg-sky-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-sky-50/82"
                  >
                    Spectator Draft
                  </Link>
                ) : null}
                {isCaptain ? (
                  <Link
                    href="/tournament/captain"
                    className="rounded-2xl bg-lime-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950"
                  >
                    Captain Portal
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="grid content-start gap-4">
          {member === false ? (
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-[2rem] border border-amber-200/18 bg-amber-200/10 p-5 text-sm font-black text-amber-50 shadow-xl shadow-black/20"
            >
              Discord beitreten, um fortzufahren
            </a>
          ) : null}
          <div className="rounded-[2rem] border border-white/10 bg-black/18 p-5 shadow-xl shadow-black/24">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
              Team
            </div>
            {team ? (
              <div className="mt-4 grid gap-2">
                <h2 className="text-2xl font-black text-emerald-50">{team.name}</h2>
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
            ) : (
              <p className="mt-3 text-sm leading-6 text-emerald-100/56">
                Noch kein Team zugewiesen. Sobald das Orga-Team Rosters baut,
                erscheint es hier.
              </p>
            )}
          </div>
        </aside>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 sm:py-14">{children}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/42">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-lime-100">{value}</div>
    </div>
  );
}
