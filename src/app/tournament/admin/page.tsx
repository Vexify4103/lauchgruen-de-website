import Link from "next/link";
import { headers } from "next/headers";
import { auth, signIn } from "@/lib/auth";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  readTournamentState,
} from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { MatchAdminClient, type AdminMatch } from "./MatchAdminClient";

export default async function TournamentAdminPage() {
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  const isLocalSubdomain =
    host.endsWith(".localhost:3000") && host !== "localhost:3000";
  const session = await auth();
  const discordId = session?.user?.discordId;
  const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
  const ctx = isOwner ? await getTournamentContext() : null;
  const state = isOwner && ctx ? await readTournamentState(ctx.groupMatches) : null;

  let adminMatches: AdminMatch[] = [];
  if (state && ctx) {
    const resolved = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
    adminMatches = [
      ...ctx.groupMatches.map<AdminMatch>((m) => ({
        id: m.id,
        teamA: m.teamA,
        teamB: m.teamB,
        status: (state.matches[m.id]?.status ?? m.status) as AdminMatch["status"],
      })),
      ...resolved.map<AdminMatch>((m) => ({
        id: m.id,
        teamA: m.teamALabel,
        teamB: m.teamBLabel,
        status: (state.matches[m.id]?.status ?? m.status) as AdminMatch["status"],
      })),
    ];
  }

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
              Owner-Panel
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
              Live-Match-Steuerung.
            </h1>
            <p className="mt-4 text-sm leading-7 text-emerald-100/68">
              Nur die Discord-Accounts von lethalfluff und lauchgruen können
              Match-Status, Scores und Sieger bearbeiten.
            </p>
          </div>
          {isOwner ? (
            <Link
              href="/tournament/admin/roster"
              className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5"
            >
              Roster-Builder →
            </Link>
          ) : null}
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
          {isOwner && state ? (
            <MatchAdminClient
              initialMatches={adminMatches}
              initialStored={state.matches}
            />
          ) : (
            <div className="rounded-2xl border border-amber-200/24 bg-amber-200/10 p-5 text-sm leading-7 text-amber-50">
              <p>Melde dich mit einem Owner-Discord-Account an, um Turniermatches zu bearbeiten.</p>
              {isLocalSubdomain ? (
                <Link
                  href="http://localhost:3000/tournament/admin"
                  className="mt-4 inline-flex rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950"
                >
                  Auf localhost weitermachen
                </Link>
              ) : (
                <form
                  className="mt-4"
                  action={async () => {
                    "use server";
                    await signIn("discord", { redirectTo: "/tournament/admin" });
                  }}
                >
                  <button className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950">
                    Mit Discord anmelden
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
