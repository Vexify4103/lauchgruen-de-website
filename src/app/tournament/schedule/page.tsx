import { TournamentLink as Link } from "../TournamentLink";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { compactPoolLabel, getTournamentWheelState } from "@/lib/tournament-wheel";
import type { WheelMatchAssignment } from "@/lib/tournament-wheel-shared";
import { playoffRollingTime } from "@/lib/tournament-schedule";

type ScheduleMatch = {
  id: string;
  day: string;
  phase: string;
  round: string;
  time: string;
  teamA: string;
  teamB: string;
  scoreA?: number;
  scoreB?: number;
  status: string;
  pool: WheelMatchAssignment | null;
};

const PLAYOFF_ORDER = [
  "ub-r1-1",
  "ub-r1-2",
  "lb-r1-1",
  "lb-r1-2",
  "ub-r2-1",
  "ub-r2-2",
  "lb-r2-1",
  "lb-r2-2",
  "ub-f",
  "lb-sf",
  "lb-f",
  "gf",
] as const;

export default async function TournamentSchedulePage() {
  const ctx = await getTournamentContext();
  const [state, wheel] = await Promise.all([
    readTournamentState(ctx.groupMatches),
    getTournamentWheelState(),
  ]);
  const playoffs = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
  const poolFor = (matchId: string) =>
    wheel.currentAssignment?.matchId === matchId
      ? wheel.currentAssignment
      : wheel.history.find((entry) => entry.matchId === matchId) ?? null;

  const friday = ctx.groupMatches.map((match) => ({
    id: match.id,
    day: "Freitag, 19.06.",
    phase: "Gruppenphase",
    round: match.round,
    time: match.time,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA: state.matches[match.id]?.scoreA,
    scoreB: state.matches[match.id]?.scoreB,
    status: state.matches[match.id]?.status ?? match.status,
    pool: poolFor(match.id),
  })).sort(compareGroupMatches);

  const saturday = playoffs.filter((match) => match.id !== "gf-reset").map((match) => ({
    id: match.id,
    day: "Samstag, 20.06.",
    phase: "Playoffs",
    round: match.round,
    time: match.time,
    teamA: match.teamALabel,
    teamB: match.teamBLabel,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    status: match.status,
    pool: poolFor(match.id),
  })).sort(
    (a, b) => PLAYOFF_ORDER.indexOf(a.id as (typeof PLAYOFF_ORDER)[number])
      - PLAYOFF_ORDER.indexOf(b.id as (typeof PLAYOFF_ORDER)[number]),
  );

  const sections = [
    {
      title: "Spieltag 1",
      description: "Gruppenphase ab 18:00 Uhr CEST · 12 Matches pro Gruppe · 6 pro Team.",
      batches: groupScheduleBatches(friday),
    },
    {
      title: "Spieltag 2",
      description: "Alle 8 Teams spielen ab 16:00 Uhr CEST im Double-Elimination-Bracket.",
      batches: playoffScheduleBatches(saturday),
    },
  ];

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Zeitplan
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Wann wird was gespielt?
          </h1>
          <p className="mt-4 text-sm leading-7 text-emerald-100/68">
            Spieltag 1 startet am Freitag, 19.06. um 18:00 Uhr CEST.
            Spieltag 2 startet am Samstag, 20.06. um 16:00 Uhr CEST.
            Alle Uhrzeiten danach sind Richtzeiten eines rollierenden Spielplans:
            Das nächste Match startet, sobald der vorherige Block abgeschlossen ist.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.06] p-4 text-sm leading-7 text-cyan-50/78">
          <strong>Rollierender Ablauf:</strong> Pro Gruppenrunde laufen vier Matches
          gleichzeitig: zwei aus Gruppe A und zwei aus Gruppe B. Die sechs
          Richtblöcke starten ungefähr um 18:00, 19:00, 20:00, 21:00, 22:00 und
          23:00 Uhr. Verzögerungen verschieben alle folgenden Blöcke gemeinsam.
        </div>

        <div className="mt-8 grid gap-6">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/60">
                    {section.title}
                  </div>
                  <h2 className="mt-2 text-2xl font-black text-emerald-50">
                    {section.description}
                  </h2>
                </div>
                <span className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/60">
                  {section.batches.reduce((sum, batch) => sum + batch.matches.length, 0)} Matches
                </span>
              </div>

              <div className="mt-5 grid gap-6">
                {section.batches.map((batch) => (
                  <section key={batch.label}>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/68">
                        {batch.label}
                      </h3>
                      <span className="h-px flex-1 bg-white/10" />
                      {batch.matches.length > 1 ? (
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/42">
                          parallel
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-3 xl:grid-cols-2">
                    {batch.matches.map((match) => {
                  const isLive = match.status === "Live";
                  const hasTeams = !/seed|winner|loser|sieger|verlierer|tbd/i.test(`${match.teamA} ${match.teamB}`);
                  return (
                    <div
                      key={match.id}
                      className={`rounded-2xl border p-4 ${
                        isLive
                          ? "border-red-300/34 bg-red-500/12 shadow-lg shadow-red-950/20"
                          : "border-white/10 bg-black/18"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/58">
                          {match.day} · {match.phase} · {match.round}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/62">
                            {match.time}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/62">
                            {statusLabel(match.status)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                        <TeamLine team={match.teamA} pool={match.pool?.teamAPool ?? null} />
                        <div className="text-center text-2xl font-black text-lime-100">
                          {match.scoreA !== undefined && match.scoreB !== undefined
                            ? `${match.scoreA}:${match.scoreB}`
                            : "vs."}
                        </div>
                        <TeamLine team={match.teamB} pool={match.pool?.teamBPool ?? null} right />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {isLive ? (
                          <span className="rounded-full border border-red-300/30 bg-red-500/16 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-100">
                            Aktuelles Match
                          </span>
                        ) : null}
                        {match.pool ? (
                          <Link
                            href={`/tournament/champ-select/${match.id}/spectate`}
                            className="rounded-full border border-sky-200/20 bg-sky-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-50/82"
                          >
                            Spectator Draft
                          </Link>
                        ) : hasTeams ? (
                          <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/38">
                            Pools noch offen
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                    })}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function compareGroupMatches(a: ScheduleMatch, b: ScheduleMatch) {
  const aParts = /^([ab])-r(\d+)-(\d+)$/.exec(a.id);
  const bParts = /^([ab])-r(\d+)-(\d+)$/.exec(b.id);
  if (!aParts || !bParts) return a.id.localeCompare(b.id);
  return Number(aParts[2]) - Number(bParts[2])
    || Number(aParts[3]) - Number(bParts[3])
    || aParts[1].localeCompare(bParts[1]);
}

function groupScheduleBatches(matches: ScheduleMatch[]) {
  const batches = new Map<string, ScheduleMatch[]>();
  for (const match of matches) {
    const parts = /^[ab]-r(\d+)-(\d+)$/.exec(match.id);
    const label = parts
      ? `Gruppenrunde ${parts[1]}`
      : match.round;
    batches.set(label, [...(batches.get(label) ?? []), match]);
  }
  return [...batches.entries()].map(([label, entries]) => ({
    label,
    matches: entries,
  }));
}

function playoffScheduleBatches(matches: ScheduleMatch[]) {
  const definitions = [
    { label: "Upper Runde 1 · A/B #2 mit viertem Ban", ids: ["ub-r1-1", "ub-r1-2"] },
    { label: "Lower Runde 1 · A/B #4 steigt ein", ids: ["lb-r1-1", "lb-r1-2"] },
    { label: "Upper Runde 2 · Gruppensieger steigen ein", ids: ["ub-r2-1", "ub-r2-2"] },
    { label: "Lower Runde 2", ids: ["lb-r2-1", "lb-r2-2"] },
    { label: "Upper Final und Lower-Halbfinale", ids: ["ub-f", "lb-sf"] },
    { label: "Lower Final", ids: ["lb-f"] },
    { label: "Grand Final", ids: ["gf"] },
  ];
  const byId = new Map(matches.map((match) => [match.id, match]));
  return definitions.map((definition, index) => ({
    label: definition.label,
    matches: definition.ids
      .map((id) => byId.get(id))
      .filter((match): match is ScheduleMatch => Boolean(match))
      .map((match) => ({ ...match, time: playoffRollingTime(index) })),
  }));
}

function statusLabel(status: string) {
  switch (status) {
    case "Scheduled":
      return "Geplant";
    case "Pending":
      return "Ausstehend";
    case "Locked":
      return "Gesperrt";
    case "Live":
      return "Live";
    case "Finished":
      return "Beendet";
    default:
      return status;
  }
}

function TeamLine({
  team,
  pool,
  right,
}: {
  team: string;
  pool: string | null;
  right?: boolean;
}) {
  return (
    <div className={right ? "text-left md:text-right" : "text-left"}>
      <div className="truncate text-xl font-black text-emerald-50">{team}</div>
      {pool ? (
        <span className="mt-1 inline-flex rounded-full border border-lime-200/18 bg-lime-200/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-lime-50/80">
          Pool {compactPoolLabel(pool)}
        </span>
      ) : null}
    </div>
  );
}
