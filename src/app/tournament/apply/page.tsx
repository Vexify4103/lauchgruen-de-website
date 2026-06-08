import { TournamentLink as Link } from "../TournamentLink";
import { headers } from "next/headers";
import { auth, signIn, signOut } from "@/lib/auth";
import { DISCORD_INVITE_URL, isDiscordGuildMember } from "@/lib/discord";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { getVerifiedAccount } from "@/lib/tournament-storage";
import { ApplicationForm } from "./ApplicationForm";

const rules = [
  "Du meldest dich verbindlich für beide Abende an: Freitag, 19.06. und Samstag, 20.06. jeweils um 18:00 Uhr.",
  "Gespielt wird mit gelosten A-Z Champion-Pools. Pro Runde sind nur Champions aus dem aktuellen Pool erlaubt.",
  "Deine Riot-Verifizierung, Main Rolle und Wunschrollen werden fürs faire Team-Balancing genutzt.",
  "Kein toxisches Verhalten, kein absichtliches Feeden, kein Account-Sharing, kein Scripting und kein Wettbewerbsbetrug.",
  "Wenn du nur teilweise Zeit hast oder unsicher bist, schreib es bitte direkt in die Notizen.",
];

export default async function ApplyPage() {
  const settings = await getTournamentSettings();
  if (!settings.applicationsOpen) {
    return (
      <div className="px-5 py-10 sm:py-14">
        <section className="mx-auto w-full max-w-3xl rounded-[2.2rem] border border-amber-200/16 bg-amber-200/[0.06] p-6 shadow-2xl shadow-black/25 sm:p-8">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-100/70">
            Bewerbungen geschlossen
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-amber-50">
            Bewerbungen öffnen in Kürze wieder.
          </h1>
          <p className="mt-4 text-sm leading-7 text-emerald-100/72">
            Das A-Z Turnier findet am 19.06. und 20.06. abends statt. Wenn du
            grundsätzlich Interesse und Zeit hast, melde dich im Discord bei
            Luca oder dem Orga-Team, bis das Formular wieder offen ist.
          </p>
          <Link
            href="/tournament"
            className="mt-6 inline-flex rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
          >
            Zurück zur Übersicht
          </Link>
        </section>
      </div>
    );
  }

  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  const isLocalSubdomain =
    host.endsWith(".localhost:3000") && host !== "localhost:3000";
  const localAuthUrl = "http://localhost:3000/tournament/apply";
  const session = await auth();
  const discordIdentity =
    session?.user?.discordId && session.user.discordHandle
      ? {
          id: session.user.discordId,
          handle: session.user.discordHandle,
        }
      : null;
  const liveGuildMember = discordIdentity
    ? await isDiscordGuildMember(discordIdentity.id)
    : null;
  const isGuildMember =
    liveGuildMember ?? (session?.user.discordInGuild ?? !process.env.DISCORD_GUILD_ID);
  const verifiedAccount = discordIdentity
    ? await getVerifiedAccount(discordIdentity.id)
    : null;
  const initialVerified = verifiedAccount
    ? {
        riotId: verifiedAccount.riotId,
        puuid: verifiedAccount.puuid,
        currentRankAuto: verifiedAccount.currentRankAuto,
        verifiedAt: verifiedAccount.verifiedAt,
      }
    : null;

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[0.86fr_1.14fr]">
        <aside className="grid content-start gap-4">
          <div className="rounded-[2rem] border border-lime-200/14 bg-white/[0.045] p-6">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
              Bewerbung
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50">
              Beim A-Z Turnier verbindlich mitspielen.
            </h1>
            <p className="mt-4 text-sm leading-7 text-emerald-100/70">
              Wir brauchen deine Angaben, um faire Teams zu bauen und das Bracket
              zu planen. Bitte trag direkt ein, wenn du an einem der beiden Abende
              unsicher bist.
            </p>
          </div>

          <div className="rounded-[2rem] border border-amber-200/14 bg-amber-200/[0.06] p-6">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/70">
              Anmeldung
            </div>
            <div className="mt-4 grid gap-3">
              {discordIdentity ? (
                <div className="rounded-2xl border border-lime-200/20 bg-lime-200/10 px-5 py-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-lime-100/62">
                    Discord verbunden
                  </div>
                  <div className="mt-2 font-black text-lime-50">
                    {discordIdentity.handle}
                  </div>
                  <form
                    className="mt-3"
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/tournament/apply" });
                    }}
                  >
                    <button
                      type="submit"
                      className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100/62 underline decoration-lime-200/30 underline-offset-4 hover:text-lime-100"
                    >
                      Trennen
                    </button>
                  </form>
                </div>
              ) : isLocalSubdomain ? (
                <Link
                  href={localAuthUrl}
                  className="rounded-2xl border border-lime-200/20 bg-lime-200/10 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-lime-50 transition hover:border-lime-200/40"
                >
                  Auf localhost anmelden
                </Link>
              ) : (
                <form
                  action={async () => {
                    "use server";
                    await signIn("discord", { redirectTo: "/tournament/apply" });
                  }}
                >
                  <button
                    type="submit"
                    className="w-full rounded-2xl border border-white/10 bg-black/24 px-5 py-4 text-left text-sm font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
                  >
                    Mit Discord anmelden
                  </button>
                </form>
              )}
            </div>
            <p className="mt-4 text-xs leading-6 text-emerald-100/58">
              Discord identifiziert die Bewerbung, die Riot-Verifizierung läuft
              direkt im Formular über das Wechseln deines League-Profilicons.
            </p>
          </div>

          <div id="rules" className="rounded-[2rem] border border-white/10 bg-black/18 p-6">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
              Regeln (Vorschau)
            </div>
            <div className="mt-4 grid gap-3">
              {rules.map((rule) => (
                <p key={rule} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-sm leading-6 text-emerald-100/72">
                  {rule}
                </p>
              ))}
            </div>
          </div>
        </aside>

        <div className="rounded-[2.2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/25 sm:p-7">
          <ApplicationForm
            discordIdentity={discordIdentity}
            isGuildMember={isGuildMember}
            discordInviteUrl={DISCORD_INVITE_URL}
            initialVerified={initialVerified}
          />
        </div>
      </section>
    </div>
  );
}
