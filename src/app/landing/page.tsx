/**
 * lauchgruentv landing page — served at lauchgruen.de/ via the proxy rewrite.
 *
 * Sections:
 *   1. Hero (logo + name + tagline)
 *   2. Live status (polls Twitch every 60s; shows thumbnail when live)
 *   3. About + games (LoL / TFT / Chess)
 *   4. Events (occasional LoL tournaments + quiz shows)
 *   5. QuizDuell CTA → jeopardy.lauchgruen.de
 *   6. Socials + footer
 */

import Image from "next/image";
import Link from "next/link";
import { LiveStatus } from "./LiveStatus";

const TWITCH_LOGIN = "lauchgruen";
const TWITCH_URL = `https://twitch.tv/${TWITCH_LOGIN}`;
const JEOPARDY_URL = "https://jeopardy.lauchgruen.de";

// Fill in real URLs — empty strings are filtered out so unfinished
// links don't render as dead buttons.
const SOCIALS: Array<{ label: string; url: string; emoji: string }> = [
  { label: "Twitch", url: TWITCH_URL, emoji: "🟣" },
  { label: "YouTube", url: "", emoji: "▶️" },
  { label: "Discord", url: "", emoji: "💬" },
  { label: "TikTok", url: "", emoji: "🎵" },
  { label: "Twitter", url: "", emoji: "🐦" },
  { label: "Instagram", url: "", emoji: "📸" },
].filter((s) => s.url);

const GAMES = [
  {
    name: "League of Legends",
    emoji: "⚔️",
    desc: "Solo Q, Ranked Climbs und die ein oder andere Inting-Story.",
    accent: "from-blue-700 to-indigo-900",
  },
  {
    name: "Teamfight Tactics",
    emoji: "♟️",
    desc: "Auto-Battler-Tüfteln, Comp-Diskussionen und Set-Releases.",
    accent: "from-amber-700 to-orange-900",
  },
  {
    name: "Chess",
    emoji: "♞",
    desc: "Schach mit Chat-Kommentaren — von Blitz bis Puzzle Rush.",
    accent: "from-slate-700 to-emerald-900",
  },
];

const EVENTS = [
  {
    emoji: "🏆",
    title: "League-Turniere",
    desc: "Community-Cups, Showmatches und gelegentliche In-House-Ligen.",
  },
  {
    emoji: "🎯",
    title: "QuizDuell-Shows",
    desc: "Jeopardy-Gameshow für mehrere Streamer — live moderiert auf Twitch.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 relative overflow-hidden">
      {/* Decorative top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-gradient-to-b from-amber-400/10 to-transparent blur-3xl" />

      <main className="relative max-w-5xl mx-auto px-6 py-16 flex flex-col items-center gap-20">
        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <section className="flex flex-col items-center gap-6 text-center pt-4">
          <Image
            src="/bear-logo.png"
            alt="lauchgruen Bär"
            width={160}
            height={160}
            className="drop-shadow-2xl"
            priority
            fetchPriority="high"
          />
          <div>
            <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight text-amber-300 drop-shadow-lg">
              lauchgruen
              <span className="text-emerald-200">.de</span>
            </h1>
            <p className="text-emerald-200/70 text-xs md:text-sm uppercase tracking-[0.4em] mt-3 font-bold">
              🍯 Gaming · Community · Gameshows
            </p>
          </div>
          <p className="text-base md:text-lg text-emerald-100/90 leading-relaxed max-w-2xl mt-2">
            Bär aus Versehen, Streamer mit Absicht. Live auf Twitch —
            überwiegend League, TFT und Schach, dazwischen Community-Events und
            QuizDuell-Shows mit anderen Streamern.
          </p>
        </section>

        {/* ─── Live status ──────────────────────────────────────────── */}
        <section className="w-full flex flex-col items-center gap-3">
          <div className="text-emerald-300/60 text-xs uppercase tracking-[0.3em] font-bold">
            Live-Status
          </div>
          <LiveStatus login={TWITCH_LOGIN} />
        </section>

        {/* ─── About / Games ────────────────────────────────────────── */}
        <section className="w-full flex flex-col gap-6">
          <div className="text-center">
            <div className="text-emerald-300/60 text-xs uppercase tracking-[0.3em] font-bold mb-2">
              Was läuft hier
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-amber-300">
              Drei Spiele, ein Lauch
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {GAMES.map((g) => (
              <div
                key={g.name}
                className={`bg-gradient-to-br ${g.accent} border border-emerald-700/40 rounded-2xl p-6 flex flex-col gap-3 shadow-lg hover:scale-[1.02] transition-transform`}
              >
                <div className="text-5xl">{g.emoji}</div>
                <div className="text-xl font-extrabold text-amber-100">
                  {g.name}
                </div>
                <div className="text-emerald-100/85 text-sm leading-relaxed">
                  {g.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Events ───────────────────────────────────────────────── */}
        <section className="w-full flex flex-col gap-6">
          <div className="text-center">
            <div className="text-emerald-300/60 text-xs uppercase tracking-[0.3em] font-bold mb-2">
              Ab und zu
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-amber-300">
              Events &amp; Specials
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EVENTS.map((e) => (
              <div
                key={e.title}
                className="bg-emerald-950/60 border border-emerald-800 rounded-2xl p-6 flex gap-4 items-start backdrop-blur-sm"
              >
                <div className="text-4xl shrink-0">{e.emoji}</div>
                <div>
                  <div className="text-xl font-extrabold text-amber-100 mb-1">
                    {e.title}
                  </div>
                  <div className="text-emerald-100/80 text-sm leading-relaxed">
                    {e.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── QuizDuell CTA ────────────────────────────────────────── */}
        <section className="w-full flex flex-col items-center gap-4 py-4">
          <div className="text-center max-w-xl">
            <div className="text-emerald-300/60 text-xs uppercase tracking-[0.3em] font-bold mb-2">
              Mitspielen
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-amber-300 mb-2">
              QuizDuell — Jeopardy für Streamer
            </h2>
            <p className="text-emerald-100/85 text-sm md:text-base">
              Echtzeit-Gameshow, 6 Kategorien, drei Boards, Buzzer und
              Bonusrunden. Spielst du auf{" "}
              <span className="font-mono text-amber-300">lauchgruen</span> mit?
            </p>
          </div>

          <Link
            href={JEOPARDY_URL}
            className="group relative inline-flex items-center gap-3 bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-emerald-950 font-extrabold text-xl md:text-2xl px-8 md:px-10 py-4 md:py-5 rounded-2xl shadow-2xl shadow-amber-400/40 transition-all hover:scale-105 active:scale-95"
          >
            <span className="text-2xl md:text-3xl">🎯</span>
            <span>QuizDuell spielen</span>
            <span className="text-xl md:text-2xl transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
          <p className="text-emerald-300/60 text-xs">
            auf{" "}
            <span className="font-mono text-amber-300/80">
              jeopardy.lauchgruen.de
            </span>
          </p>
        </section>

        {/* ─── Socials ──────────────────────────────────────────────── */}
        {SOCIALS.length > 0 ? (
          <section className="w-full flex flex-col items-center gap-4">
            <div className="text-emerald-300/60 text-xs uppercase tracking-[0.3em] font-bold">
              Folgen
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700 hover:border-amber-400/60 text-emerald-100 hover:text-amber-300 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                >
                  <span>{s.emoji}</span>
                  <span>{s.label}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="relative px-6 py-8 text-center text-emerald-500/50 text-xs">
        © {new Date().getFullYear()} lauchgruen · gebaut mit 🍯
      </footer>
    </div>
  );
}
