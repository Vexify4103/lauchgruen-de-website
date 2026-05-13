import Image from "next/image";
import { auth, signIn, signOut } from "@/lib/auth";
import { CreateGameButton } from "@/components/CreateGameButton";
import { JoinGameForm } from "@/components/JoinGameForm";

const ALLOWED_HOSTS = ["lauchgruen", "vexi_fy"];
const VEXIFY_URL = "https://twitch.tv/vexi_fy";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const canHost = ALLOWED_HOSTS.includes(session?.user?.twitchLogin ?? "");
  const errorMessage =
    sp.error === "game_not_found"
      ? `Spiel ${sp.code ? `"${sp.code}"` : ""} existiert nicht oder wurde beendet.`
      : null;

  return (
    <div className="relative min-h-screen overflow-hidden px-6 text-emerald-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.16),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(circle_at_left,rgba(16,185,129,0.12),transparent_65%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center py-10 lg:py-14">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="flex flex-col gap-8">
            <div className="brand-chip w-fit">
              <Image
                src="/bear-logo.png"
                alt="QuizDuell Bear"
                width={96}
                height={96}
                className="brand-mark rounded-2xl shadow-2xl shadow-amber-500/10"
                priority
              />
              <div>
                <div className="section-kicker">Live Gameshow</div>
                <div className="mt-2 text-2xl font-black tracking-tight text-amber-300 sm:text-3xl">
                  QUIZ<span className="text-emerald-100">DUELL</span>
                </div>
              </div>
            </div>

            <div className="max-w-2xl">
              <h1 className="text-4xl font-black leading-tight tracking-tight text-emerald-50 sm:text-5xl lg:text-6xl">
                Die Gameshow fur besondere Stream-Events und eingeladene
                Gaste.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-emerald-100/78 sm:text-lg">
                QuizDuell ist kein offenes Tool, sondern wird fur ausgewahlte
                Runden auf lauchgruen genutzt. Wenn du einen Spielcode hast,
                bist du fur das Event eingeplant.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="surface-panel rounded-3xl p-5">
                <div className="section-kicker">Format</div>
                <div className="mt-3 text-lg font-bold text-amber-100">
                  Private Showrunde
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                  Gespielt wird nur im Rahmen geplanter Streams und Events mit
                  eingeladenen Teilnehmenden.
                </p>
              </div>
              <div className="surface-panel rounded-3xl p-5">
                <div className="section-kicker">Zugang</div>
                <div className="mt-3 text-lg font-bold text-amber-100">
                  Eintritt per Code
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                  Ohne Einladung oder Spielcode gibt es nichts vorzubereiten,
                  nur auf den nachsten Event warten.
                </p>
              </div>
              <div className="surface-panel rounded-3xl p-5">
                <div className="section-kicker">Live</div>
                <div className="mt-3 text-lg font-bold text-amber-100">
                  On Stream
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                  Kategorien, Punkte und Buzzer laufen live, sobald die Runde
                  auf Sendung geht.
                </p>
              </div>
            </div>
          </section>

          <section className="surface-panel-strong rounded-[2rem] p-5 sm:p-7 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Spielzentrale</div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-amber-100 sm:text-3xl">
                  Rein in die nachste Runde
                </h2>
              </div>
              <div className="hidden rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-amber-200 sm:block">
                Multi-Streamer
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
                {errorMessage}
              </div>
            ) : null}

            {session?.user ? (
              <div className="mt-6 flex flex-col gap-5">
                <div className="surface-panel rounded-[1.6rem] p-4 sm:p-5">
                  <div className="flex items-center gap-4">
                    {session.user.image ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name ?? "avatar"}
                        width={56}
                        height={56}
                        className="rounded-2xl border-2 border-amber-400 object-cover shadow-lg shadow-amber-500/10"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-2xl bg-emerald-900/70" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300/68">
                        Eingeloggt als
                      </div>
                      <div className="mt-1 truncate text-xl font-black text-amber-100">
                        {session.user.name}
                      </div>
                      <div className="text-sm text-emerald-200/72">
                        @{session.user.twitchLogin}
                      </div>
                    </div>
                  </div>
                </div>

                {canHost ? (
                  <div className="surface-panel rounded-[1.6rem] p-5">
                    <div className="section-kicker">Hosten</div>
                    <div className="mt-3 text-xl font-black text-amber-100">
                      Event-Lobby starten
                    </div>
                    <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                      Nur fur freigeschaltete Hosts. Starte die Lobby fur die
                      nachste geplante QuizDuell-Runde.
                    </p>
                    <div className="mt-5">
                      <CreateGameButton />
                    </div>
                  </div>
                ) : null}

                <div className="surface-panel rounded-[1.6rem] p-5">
                  <div className="section-kicker">Beitreten</div>
                  <div className="mt-3 text-xl font-black text-amber-100">
                    Mit Einladungscode beitreten
                  </div>
                  <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                    Du bist fur die Runde eingeplant? Dann mit dem erhaltenen
                    Spielcode direkt in die Lobby.
                  </p>
                  <div className="mt-5">
                    <JoinGameForm />
                  </div>
                </div>

                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm font-medium text-emerald-300/70 underline decoration-emerald-400/30 underline-offset-4 transition-colors hover:text-amber-300"
                  >
                    Abmelden
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-5">
                <div className="surface-panel rounded-[1.6rem] p-5">
                  <div className="section-kicker">Anmelden</div>
                  <div className="mt-3 text-xl font-black text-amber-100">
                    Twitch rein, Runde los
                  </div>
                  <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                    Login via Twitch, danach kannst du hosten oder mit einem Code
                    beitreten.
                  </p>
                  <form
                    className="mt-5"
                    action={async () => {
                      "use server";
                      await signIn("twitch", { redirectTo: "/" });
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-6 py-4 text-base font-black text-emerald-950 shadow-xl shadow-amber-500/20 transition-transform hover:-translate-y-0.5 hover:shadow-amber-400/30"
                    >
                      Mit Twitch anmelden
                    </button>
                  </form>
                </div>

                <div className="rounded-[1.6rem] border border-emerald-400/12 bg-emerald-950/35 p-5">
                  <div className="section-kicker">Hinweis</div>
                  <p className="mt-3 text-sm leading-6 text-emerald-100/72">
                    QuizDuell wird fur ausgewahlte Events auf Twitch genutzt.
                    Ohne Einladung brauchst du hier nichts weiter zu tun.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="relative border-t border-emerald-300/12 px-6 pb-8 pt-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-sm text-emerald-200/58 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300/46">
              QuizDuell
            </div>
            <p className="mt-2 max-w-md leading-6">
              Echtzeit-Gameshow fur Streamer, gebaut fur schnelle Lobbys,
              klare Join-Flows und saubere Showstarts.
            </p>
          </div>
          <div className="text-sm text-emerald-100/62 sm:text-right">
            <div>© {new Date().getFullYear()} QuizDuell</div>
            <a
              href={VEXIFY_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 font-semibold text-amber-200 transition-colors hover:text-amber-100"
            >
              Crafted by vexify
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
