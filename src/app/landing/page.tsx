/**
 * Streamer landing page served at lauchgruen.de/ (rewritten from /landing
 * by middleware so the URL bar stays clean).
 *
 * Content is placeholder-ish — swap text/links/images for real lauchgruentv
 * branding once you have copy ready. Theme matches the quiz app so the
 * jump from landing → game feels continuous.
 */

import Image from "next/image";
import Link from "next/link";

const TWITCH_LOGIN  = "lauchgruentv";
const TWITCH_URL    = `https://twitch.tv/${TWITCH_LOGIN}`;
const JEOPARDY_URL  = "https://jeopardy.lauchgruen.de";

// Fill these in as you set them up — empty strings hide the link.
const SOCIALS: Array<{ label: string; url: string; emoji: string }> = [
  { label: "Twitch",   url: TWITCH_URL,                                  emoji: "🟣" },
  { label: "YouTube",  url: "",                                          emoji: "▶️" },
  { label: "Discord",  url: "",                                          emoji: "💬" },
  { label: "TikTok",   url: "",                                          emoji: "🎵" },
  { label: "Twitter",  url: "",                                          emoji: "🐦" },
].filter((s) => s.url);

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 flex flex-col">
      {/* Decorative top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-amber-400/10 to-transparent blur-3xl" />

      <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-16 gap-12 max-w-3xl mx-auto w-full text-center">
        {/* Logo + name */}
        <div className="flex flex-col items-center gap-5">
          <Image
            src="/bear-logo.png"
            alt="lauchgruentv Bär"
            width={180}
            height={180}
            className="drop-shadow-2xl"
            priority
            fetchPriority="high"
          />
          <div>
            <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight text-amber-300 drop-shadow-lg">
              lauchgruen
              <span className="text-emerald-200">tv</span>
            </h1>
            <p className="text-emerald-200/70 text-sm uppercase tracking-[0.4em] mt-3 font-bold">
              🍯 Twitch · Gaming · Gameshows
            </p>
          </div>
        </div>

        {/* Tagline — replace with real bio when you have one */}
        <p className="text-lg md:text-xl text-emerald-100/90 leading-relaxed max-w-xl">
          Live auf Twitch — gemütliche Gaming-Streams, Community-Events und
          die wohl bärigste Quiz-Gameshow im deutschsprachigen Raum.
        </p>

        {/* Primary CTA — Jeopardy */}
        <Link
          href={JEOPARDY_URL}
          className="group relative inline-flex items-center gap-3 bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-emerald-950 font-extrabold text-2xl px-10 py-5 rounded-2xl shadow-2xl shadow-amber-400/40 transition-all hover:scale-105 active:scale-95"
        >
          <span className="text-3xl">🎯</span>
          <span>QuizDuell spielen</span>
          <span className="text-2xl transition-transform group-hover:translate-x-1">→</span>
        </Link>
        <p className="text-emerald-300/60 text-xs -mt-8">
          Echtzeit-Jeopardy für mehrere Streamer · auf <span className="font-mono text-amber-300/80">jeopardy.lauchgruen.de</span>
        </p>

        {/* Secondary CTA — Twitch */}
        <a
          href={TWITCH_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl px-6 py-3 transition-colors shadow-lg shadow-purple-600/30"
        >
          <span>🟣</span>
          <span>Live auf Twitch ansehen</span>
        </a>

        {/* Socials */}
        {SOCIALS.length > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
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
        ) : null}
      </main>

      <footer className="relative px-6 py-6 text-center text-emerald-500/50 text-xs">
        © {new Date().getFullYear()} lauchgruentv · gebaut mit 🍯 von der Community
      </footer>
    </div>
  );
}
