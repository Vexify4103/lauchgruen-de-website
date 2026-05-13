import Image from "next/image";
import Link from "next/link";
import { LiveStatus } from "./LiveStatus";

const TWITCH_LOGIN = "lauchgruen";
const TWITCH_URL = `https://twitch.tv/${TWITCH_LOGIN}`;
const JEOPARDY_URL = "https://jeopardy.lauchgruen.de";
const VEXIFY_URL = "https://twitch.tv/vexi_fy";

const SOCIALS: Array<{ label: string; url: string; emoji: string }> = [
  { label: "Twitch", url: TWITCH_URL, emoji: "Live" },
  { label: "YouTube", url: "", emoji: "Video" },
  { label: "Discord", url: "", emoji: "Chat" },
  { label: "TikTok", url: "", emoji: "Clips" },
  { label: "Twitter", url: "", emoji: "Feed" },
  { label: "Instagram", url: "", emoji: "Fotos" },
].filter((social) => social.url);

const GAMES = [
  {
    name: "League of Legends",
    desc: "Solo Q, Ranked Climbs und genug Storylines fur Chat und Flame-Historie.",
    accent:
      "from-sky-500/20 via-sky-400/10 to-emerald-500/10 border-sky-300/20",
  },
  {
    name: "Teamfight Tactics",
    desc: "Set-Launches, Meta-Talk und genau die richtige Menge Comp-Kopfkino.",
    accent:
      "from-amber-400/20 via-orange-400/10 to-emerald-500/10 border-amber-300/20",
  },
  {
    name: "Chess",
    desc: "Blitz, Puzzle und Chat-Kommentare zwischen Tilt und Genialitat.",
    accent:
      "from-emerald-400/16 via-emerald-300/10 to-cyan-400/8 border-emerald-300/20",
  },
];

const EVENTS = [
  {
    title: "League-Turniere",
    desc: "Community-Cups, Showmatches und gelegentliche In-House-Ligen.",
  },
  {
    title: "QuizDuell-Shows",
    desc: "Live moderierte Gameshow-Runden mit mehreren Streamern und echtem Buzzer-Druck.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden text-emerald-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.16),transparent_64%)]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[24rem] w-[24rem] rounded-full bg-emerald-400/8 blur-3xl" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-8 sm:py-10 lg:gap-18 lg:py-12">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="flex flex-col gap-7">
            <div className="brand-chip w-fit">
              <Image
                src="/bear-logo.png"
                alt="lauchgruen Bär"
                width={112}
                height={112}
                className="brand-mark-hero rounded-3xl shadow-2xl shadow-amber-500/10"
                priority
                fetchPriority="high"
              />
              <div>
                <div className="section-kicker">Streamer Hub</div>
                <div className="mt-2 text-2xl font-black tracking-tight text-amber-300 sm:text-3xl">
                  lauchgruen<span className="text-emerald-100">.de</span>
                </div>
              </div>
            </div>

            <div className="max-w-2xl">
              <h1 className="text-4xl font-black leading-tight tracking-tight text-emerald-50 sm:text-5xl lg:text-6xl">
                Streams, Community und Events an einem Ort.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-emerald-100/78 sm:text-lg">
                Live auf Twitch mit League, TFT, Chess und genau den Community-Events,
                die plotzlich aus einem Stream einen Abend machen.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="surface-panel rounded-[1.8rem] p-5">
                <div className="section-kicker">Was hier passiert</div>
                <p className="mt-3 text-lg font-semibold leading-8 text-emerald-50">
                  Bär aus Versehen, Streamer mit Absicht. Meistens kompetitiv,
                  manchmal chaotisch, idealerweise beides gleichzeitig.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={TWITCH_URL}
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-amber-500/20 transition-transform hover:-translate-y-0.5"
                >
                  Twitch ansehen
                </Link>
                <Link
                  href={JEOPARDY_URL}
                  className="inline-flex items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-950/45 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition-colors hover:border-amber-300/30 hover:text-amber-200"
                >
                  QuizDuell
                </Link>
              </div>
            </div>
          </div>

          <div className="surface-panel-strong rounded-[2rem] p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="section-kicker">Live-Status</div>
                <div className="mt-2 text-2xl font-black text-amber-100">
                  Was lauft gerade?
                </div>
              </div>
              <div className="rounded-full border border-emerald-300/18 bg-emerald-950/45 px-3 py-1 text-xs font-bold uppercase tracking-[0.28em] text-emerald-200/76">
                Twitch
              </div>
            </div>
            <div className="mt-5">
              <LiveStatus login={TWITCH_LOGIN} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="surface-panel rounded-[2rem] p-6">
            <div className="section-kicker">Im Stream</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-amber-100">
              Drei Spiele, ein Rhythmus
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-7 text-emerald-100/72">
              Von Ranked-Grind uber TFT-Setstarts bis zu Chess-Runden mit Chat:
              hier dreht sich alles um kompetitive Spiele und gute Abende live
              auf Twitch.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {GAMES.map((game) => (
              <div
                key={game.name}
                className={`rounded-[1.8rem] border bg-gradient-to-br p-5 shadow-xl shadow-black/10 ${game.accent}`}
              >
                <div className="section-kicker">Game</div>
                <div className="mt-3 text-xl font-black text-amber-100">
                  {game.name}
                </div>
                <p className="mt-3 text-sm leading-6 text-emerald-100/76">
                  {game.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {EVENTS.map((event) => (
              <div key={event.title} className="surface-panel rounded-[1.8rem] p-6">
                <div className="section-kicker">Event</div>
                <div className="mt-3 text-2xl font-black text-amber-100">
                  {event.title}
                </div>
                <p className="mt-3 text-sm leading-7 text-emerald-100/74">
                  {event.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="surface-panel-strong rounded-[2rem] p-6 sm:p-7">
            <div className="section-kicker">Mitspielen</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-amber-100">
              QuizDuell fur Streamer
            </h2>
            <p className="mt-3 text-sm leading-7 text-emerald-100/74">
              Kategorien, Buzzer, Punkte und eine Lobby fur schnelle
              Showrunden mit mehreren Streamern. Wenn der Stream zur Gameshow
              wird, geht es hier direkt rein.
            </p>
            <Link
              href={JEOPARDY_URL}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-6 py-4 text-base font-black text-emerald-950 shadow-xl shadow-amber-500/20 transition-transform hover:-translate-y-0.5"
            >
              QuizDuell starten
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-emerald-200/54">
              jeopardy.lauchgruen.de
            </p>
          </div>
        </section>

        {SOCIALS.length > 0 ? (
          <section className="surface-panel rounded-[2rem] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="section-kicker">Folgen</div>
                <div className="mt-2 text-2xl font-black text-amber-100">
                  Mehr als nur der Stream
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {SOCIALS.map((social) => (
                  <a
                    key={social.label}
                    href={social.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/18 bg-emerald-950/40 px-4 py-3 text-sm font-bold text-emerald-100 transition-colors hover:border-amber-300/28 hover:text-amber-200"
                  >
                    <span className="text-xs uppercase tracking-[0.18em] text-emerald-300/64">
                      {social.emoji}
                    </span>
                    <span>{social.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="relative border-t border-emerald-300/12 px-6 pb-8 pt-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-sm text-emerald-200/58 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300/46">
              lauchgruen.de
            </div>
            <p className="mt-2 max-w-md leading-6">
              Twitch, Community-Events und QuizDuell in einem ruhigeren,
              professionelleren Broadcast-Rahmen.
            </p>
          </div>
          <div className="text-sm text-emerald-100/62 sm:text-right">
            <div>© {new Date().getFullYear()} lauchgruen</div>
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
