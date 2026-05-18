import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { getSiteUrls } from "@/lib/site-urls";
import { LiveStatus } from "./LiveStatus";
import { RecentClips } from "./RecentClips";

const TWITCH_LOGIN = "lauchgruen";
const TWITCH_URL = `https://twitch.tv/${TWITCH_LOGIN}`;
const VEXIFY_URL = "https://twitch.tv/vexi_fy";
const QUIZ_ENABLED = process.env.QUIZ_ENABLED !== "false";

const HIGHLIGHTS = [
  { kicker: "Live", title: "Twitch", text: "League, TFT, Chess. Ruhige Moderation, klares Timing." },
  { kicker: "Cup", title: "Turniere", text: "Bewerbung, Teams, Bracket — sauber durchgespielt." },
  { kicker: "Show", title: "Quizshow", text: "Buzzer, Punkte, Ablauf. Sofort sendebereit." },
];

const GAMES = [
  {
    name: "League of Legends",
    text: "Solo Queue, Ranked-Climb, Late-Night-Analysen.",
    accent: "from-sky-300/22 via-cyan-400/12 to-emerald-400/10",
  },
  {
    name: "Teamfight Tactics",
    text: "Set-Starts, Meta-Talk, lange Setrunden.",
    accent: "from-amber-300/22 via-orange-400/12 to-emerald-400/10",
  },
  {
    name: "Chess",
    text: "Blitz, Puzzle, scharfe Partien mit Chat.",
    accent: "from-emerald-300/22 via-emerald-400/12 to-cyan-400/10",
  },
];

const EVENTS = [
  { title: "Community-Abende", text: "Showmatches und Spezialformate." },
  { title: "Sonderstreams", text: "Wenn ein Abend einen eigenen Rahmen braucht." },
];

export const metadata: Metadata = {
  title: "lauchgruen",
  description: "Streams, Turniere und Quizshow-Abende auf lauchgruen.de.",
};

export default async function LandingPage() {
  const siteUrls = getSiteUrls((await headers()).get("host"));

  return (
    <div className="relative min-h-screen text-emerald-50">
      {/* Viewport-anchored ambient glows — fixed so they never reveal a "band end" as you scroll. */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-[-10rem] top-[8rem] -z-10 h-[28rem] w-[28rem] rounded-full bg-emerald-400/8 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-[-9rem] top-[4rem] -z-10 h-[26rem] w-[26rem] rounded-full bg-lime-300/8 blur-3xl"
      />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-6 sm:py-10 lg:gap-8 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-[2.4rem] border border-lime-200/14 bg-gradient-to-br from-lime-200/12 via-emerald-400/8 to-cyan-400/8 p-6 shadow-2xl shadow-black/30 sm:p-8 lg:p-10">
            <div className="flex items-center gap-4">
              <Image
                src="/bear-logo.png"
                alt="lauchgrün Bär"
                width={88}
                height={88}
                className="rounded-3xl shadow-2xl shadow-emerald-500/14"
                priority
                fetchPriority="high"
              />
              <div>
                <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
                  Streamer Hub
                </div>
                <div className="mt-2 text-2xl font-black tracking-tight text-emerald-50 sm:text-3xl">
                  lauchgruen<span className="text-lime-200">.de</span>
                </div>
              </div>
            </div>

            <h1 className="mt-8 max-w-[14ch] text-5xl font-black leading-[0.92] tracking-tight text-emerald-50 sm:text-6xl lg:text-7xl">
              Stream, Cup, Show — eine Adresse.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-emerald-100/72 sm:text-lg">
              Live auf Twitch mit League, TFT und Chess. Daneben eigene Turniere
              und Quizshow-Abende mit Buzzer, Bracket und Broadcast-Polish.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={TWITCH_URL}
                className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5"
              >
                Twitch ansehen
              </Link>
              <Link
                href={siteUrls.tournament}
                className="rounded-2xl border border-white/14 bg-white/[0.04] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
              >
                Zum Turnier
              </Link>
              {QUIZ_ENABLED ? (
                <Link
                  href={siteUrls.quiz}
                  className="rounded-2xl border border-white/14 bg-white/[0.04] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
                >
                  Quizshow
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="Quizshow ist aktuell deaktiviert"
                  className="cursor-not-allowed rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100/32"
                >
                  Quizshow
                </span>
              )}
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-3xl border border-white/10 bg-black/18 p-5"
                >
                  <div className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/58">
                    {item.kicker}
                  </div>
                  <div className="mt-3 text-lg font-black text-emerald-50">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-emerald-100/68">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <aside className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
                  Live-Status
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-emerald-50 sm:text-3xl">
                  Was läuft gerade?
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-lime-200/72">
                Twitch
              </div>
            </div>

            <div className="mt-5">
              <LiveStatus login={TWITCH_LOGIN} />
            </div>
          </aside>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
                Im Stream
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">
                Drei Spiele, ein Rhythmus
              </h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-emerald-100/64">
              Kompetitiv, dynamisch, mit Platz für Chat zwischen Ranked-Grind
              und ruhigen Spätabenden.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {GAMES.map((game) => (
              <article
                key={game.name}
                className={`h-full rounded-[1.8rem] border border-white/10 bg-gradient-to-br p-5 shadow-xl shadow-black/20 ${game.accent}`}
              >
                <div className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/58">
                  Game
                </div>
                <div className="mt-3 text-xl font-black text-emerald-50">
                  {game.name}
                </div>
                <p className="mt-3 text-sm leading-6 text-emerald-100/72">
                  {game.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
                Clips
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">
                Frisch aus dem Chat
              </h2>
            </div>
            <a
              href={`https://www.twitch.tv/${TWITCH_LOGIN}/clips`}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
            >
              Alle Clips
            </a>
          </div>

          <div className="mt-6">
            <RecentClips login={TWITCH_LOGIN} count={6} />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {EVENTS.map((event) => (
            <article
              key={event.title}
              className="h-full rounded-[1.9rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-black/20"
            >
              <div className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/58">
                Event
              </div>
              <div className="mt-3 text-xl font-black text-emerald-50">
                {event.title}
              </div>
              <p className="mt-3 text-sm leading-6 text-emerald-100/68">
                {event.text}
              </p>
            </article>
          ))}

          <article className="h-full rounded-[1.9rem] border border-lime-200/20 bg-gradient-to-br from-lime-200/14 via-emerald-400/8 to-cyan-400/8 p-6 shadow-xl shadow-black/24">
            <div className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/72">
              Mitspielen
            </div>
            <div className="mt-3 text-xl font-black text-emerald-50">
              League Turniere
            </div>
            <p className="mt-3 text-sm leading-6 text-emerald-100/72">
              Bewerbung, Gruppen, Playoffs — der ganze Cup auf einer Seite.
            </p>
            <Link
              href={siteUrls.tournament}
              className="mt-5 inline-flex rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20"
            >
              tournament.lauchgruen.de
            </Link>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-amber-200/20 bg-amber-200/[0.06] p-6 shadow-xl shadow-black/20 sm:p-7">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-100/70">
              Quizshow
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-amber-50">
              Die Quizshow für Streamer
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-emerald-100/72">
              Buzzer, Punkte, sauberer Ablauf. Funktioniert live, ohne Setup-Stress.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {QUIZ_ENABLED ? (
                <Link
                  href={siteUrls.quiz}
                  className="rounded-2xl bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-amber-950 shadow-xl shadow-amber-500/20 transition hover:-translate-y-0.5"
                >
                  Quizshow starten
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="Quizshow ist aktuell deaktiviert"
                  className="cursor-not-allowed rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-amber-100/35"
                >
                  Quizshow pausiert
                </span>
              )}
              <div className={`inline-flex items-center rounded-2xl border border-white/10 bg-black/24 px-4 py-4 text-xs font-bold uppercase tracking-[0.22em] ${QUIZ_ENABLED ? "text-emerald-100/58" : "text-emerald-100/30"}`}>
                quiz.lauchgruen.de
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-black/20">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
              Folgen
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-emerald-50 sm:text-3xl">
              Mehr als nur der Stream
            </h2>
            <p className="mt-4 text-sm leading-7 text-emerald-100/68">
              Twitch bleibt die Homebase — für Live-Abende, spontane Sessions
              und die nächste große Show.
            </p>
            <a
              href={TWITCH_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
            >
              <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/64">
                Live
              </span>
              Twitch
            </a>
          </div>
        </section>
      </main>

      <footer className="relative mt-6 border-t border-white/8 px-6 pb-8 pt-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-sm text-emerald-200/58 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/48">
              lauchgruen.de
            </div>
            <p className="mt-2 max-w-md leading-6 text-emerald-100/56">
              Twitch, Turniere und Quizshow im selben Broadcast-Rahmen.
            </p>
          </div>
          <div className="text-sm text-emerald-100/62 sm:text-right">
            <div>&copy; {new Date().getFullYear()} lauchgruen</div>
            <a
              href={VEXIFY_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-lime-200/72 transition hover:text-lime-100"
            >
              crafted by vexify
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
