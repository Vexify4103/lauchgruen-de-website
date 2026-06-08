import Link from "next/link";
import { auth, signIn } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  listBlacklistEntries,
  listApplications,
  type TournamentApplication,
} from "@/lib/tournament-storage";
import { DeleteApplicantButton } from "./DeleteApplicantButton";
import { EditApplicantForm } from "./EditApplicantForm";
import { RefreshRanksButton } from "./RefreshRanksButton";
import { BlacklistManager } from "./BlacklistManager";

export const dynamic = "force-dynamic";

type BotPlayerLike = { discordId?: string; riotId?: string };
type BotTeam = { name: string; players?: BotPlayerLike[] };

/**
 * Reads bot_state.teams and returns a map of discordId → teamName for every
 * player currently on a team. Used to show "Assigned to X" badges.
 */
async function loadAssignmentMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const db = await getDb();
    const doc = await db
      .collection<{ _id: string; teams?: Record<string, BotTeam> }>("bot_state")
      .findOne({ _id: "default" });
    const teams = doc?.teams ?? {};
    for (const team of Object.values(teams)) {
      for (const player of team.players ?? []) {
        if (player.discordId) map.set(player.discordId, team.name);
      }
    }
  } catch {
    // Quiet failure — page still renders without "assigned" data.
  }
  return map;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default async function ApplicantsPage() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));

  if (!isOwner) {
    return (
      <div className="px-5 py-10 sm:py-14">
        <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-amber-200/24 bg-amber-200/10 p-6 text-sm leading-7 text-amber-50">
          <p>Melde dich mit einem Owner-Discord-Account an, um Bewerbungen einzusehen.</p>
          <form
            className="mt-4"
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: "/tournament/admin/applicants" });
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

  const [applications, assignedByDiscordId, blacklistEntries] = await Promise.all([
    listApplications(),
    loadAssignmentMap(),
    listBlacklistEntries(),
  ]);

  // Newest-first
  const sorted = [...applications].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  const assignedCount = sorted.filter((a) =>
    assignedByDiscordId.has(a.discordId),
  ).length;
  const unassignedCount = sorted.length - assignedCount;

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
              Bewerbungen
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
              Eingereichte Anmeldungen.
            </h1>
          </div>
          <Link
            href="/tournament/admin"
            className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
          >
            ← Zurück zum Admin
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <StatPill label="Gesamt" value={sorted.length.toString()} tone="neutral" />
          <StatPill label="Zugewiesen" value={assignedCount.toString()} tone="ok" />
          <StatPill label="Offen" value={unassignedCount.toString()} tone="warn" />
          <RefreshRanksButton label="Alle Ränge aktualisieren" confirmBulk />
        </div>

        <BlacklistManager initialEntries={blacklistEntries} />

        {sorted.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 text-sm leading-7 text-emerald-100/68">
            Noch keine Bewerbungen eingegangen.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((app) => (
              <ApplicantCard
                key={app.id}
                app={app}
                assignedTo={assignedByDiscordId.get(app.discordId) ?? null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "ok" | "warn";
}) {
  const tones = {
    neutral: "border-white/12 bg-white/[0.04] text-emerald-100",
    ok: "border-lime-200/30 bg-lime-200/10 text-lime-50",
    warn: "border-amber-200/30 bg-amber-200/12 text-amber-100",
  } as const;
  return (
    <div className={`flex items-baseline gap-2 rounded-2xl border px-4 py-2 ${tones[tone]}`}>
      <span className="text-xl font-black">{value}</span>
      <span className="text-[10px] font-black uppercase tracking-[0.22em] opacity-72">
        {label}
      </span>
    </div>
  );
}

function ApplicantCard({
  app,
  assignedTo,
}: {
  app: TournamentApplication;
  assignedTo: string | null;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-black text-emerald-50">
            {app.discordUsername ? `@${app.discordUsername}` : app.discordHandle}
          </div>
          <div className="truncate text-xs text-lime-200/72">{app.riotId}</div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {assignedTo ? (
            <span
              title={`Zugewiesen zu ${assignedTo}`}
              className="rounded-full border border-lime-200/30 bg-lime-200/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-lime-50"
            >
              ✓ {assignedTo}
            </span>
          ) : (
            <span className="rounded-full border border-amber-200/30 bg-amber-200/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100">
              Offen
            </span>
          )}
          <DeleteApplicantButton
            discordId={app.discordId}
            label={app.discordUsername ? `@${app.discordUsername}` : app.discordHandle}
          />
        </div>
      </header>

      <div className="grid gap-2 text-xs">
        <Row label="Anzeigename">{app.displayName}</Row>
        <Row label="Aktueller Rang">
          <span className="flex flex-wrap items-center gap-2">
            <span>{app.currentRankAuto ?? <span className="italic text-emerald-100/40">Unranked</span>}</span>
            <RefreshRanksButton applicationId={app.id} label="Refresh" />
          </span>
        </Row>
        <Row label="Main Rolle">
          {app.mainRole ?? <span className="italic text-emerald-100/40">nicht angegeben</span>}
        </Row>
      </div>

      <EditApplicantForm app={app} />

      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">
          Wunschrollen
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {app.preferredRoles.length === 0 ? (
            <span className="text-xs italic text-emerald-100/40">keine angegeben</span>
          ) : (
            app.preferredRoles.map((r) => (
              <span
                key={r}
                className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/72"
              >
                {r}
              </span>
            ))
          )}
        </div>
      </div>

      {app.notes ? (
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">
            Notizen
          </div>
          <p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/22 p-3 text-xs leading-5 text-emerald-100/72">
            {app.notes}
          </p>
        </div>
      ) : null}

      <footer className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-[10px] text-emerald-100/40">
        <span title={`Discord-ID ${app.discordId}`}>
          Eingegangen {formatDate(app.createdAt)}
        </span>
        {app.createdAt !== app.updatedAt ? (
          <span>Bearbeitet {formatDate(app.updatedAt)}</span>
        ) : null}
      </footer>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">
        {label}
      </span>
      <span className="truncate font-bold text-emerald-50">{children}</span>
    </div>
  );
}
