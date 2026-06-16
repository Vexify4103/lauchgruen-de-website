import { TournamentLink as Link } from "../../TournamentLink";
import { auth, signIn } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { loadRosterSnapshot } from "@/lib/roster";
import { RosterBuilder } from "./RosterBuilder";
import { getAdminVersion } from "@/lib/admin-version";

export const dynamic = "force-dynamic";

export default async function RosterPage() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));

  if (!isOwner) {
    return (
      <div className="px-5 py-10 sm:py-14">
        <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-amber-200/24 bg-amber-200/10 p-6 text-sm leading-7 text-amber-50">
          <p>Melde dich mit einem Owner-Discord-Account an, um Rosters auszubalancieren.</p>
          <form
            className="mt-4"
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: "/tournament/admin/roster" });
            }}
          >
            <button className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950">
              Mit Discord anmelden
            </button>
          </form>
        </section>
      </div>
    );
  }

  const [snapshot, version] = await Promise.all([
    loadRosterSnapshot(),
    getAdminVersion("roster"),
  ]);

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
              Roster-Builder
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
              Spielerteams einteilen
            </h1>
            <p className="mt-4 text-sm leading-7 text-emerald-100/68">
              Klicke einen leeren Rollen-Slot, um einen Spieler zuzuweisen
            </p>
          </div>
          <Link
            href="/tournament/admin"
            className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
          >
            ← Zurück zum Admin
          </Link>
        </div>

        <div className="mt-8">
          <RosterBuilder snapshot={snapshot} initialVersion={version} />
        </div>
      </section>
    </div>
  );
}
