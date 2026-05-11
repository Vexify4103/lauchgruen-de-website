"use client";

/**
 * Shown when a player/host/spectator hits a game URL that doesn't exist
 * server-side anymore — game ended, server restarted, or the code was wrong.
 *
 * "Back to home" goes to the apex landing (lauchgruen.de), not the quiz
 * sign-in page, so the user lands somewhere informative instead of being
 * thrown back into the same expired-link loop.
 */

import Image from "next/image";

interface Props {
  /** Optional code shown in monospace so the user knows which game it was. */
  code?: string;
}

/**
 * Derive the apex landing URL from the current host:
 *   jeopardy.lauchgruen.de        → https://lauchgruen.de
 *   jeopardy.lauchgruen.localhost → http://lauchgruen.localhost:<port>
 *   localhost                     → /  (just go to whatever's at root; dev)
 *
 * Computed at render time on the client so dev + prod both Just Work
 * without env-var juggling.
 */
function apexHomeUrl(): string {
  if (typeof window === "undefined") return "https://lauchgruen.de";
  const { hostname, port, protocol } = window.location;
  if (hostname.startsWith("jeopardy.")) {
    const apex = hostname.replace(/^jeopardy\./, "");
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${apex}${portSuffix}`;
  }
  // Unknown / plain localhost — root works fine in dev.
  return "/";
}

export function GameNotFound({ code }: Props) {
  const homeUrl = apexHomeUrl();
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 flex flex-col items-center justify-center px-6 py-16 relative">
      {/* Decorative top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-amber-400/10 to-transparent blur-3xl" />

      <div className="relative max-w-lg w-full flex flex-col items-center text-center gap-8">
        <Image
          src="/bear-logo.png"
          alt="QuizDuell Bär"
          width={140}
          height={140}
          className="drop-shadow-2xl opacity-90"
          priority
        />

        <div className="space-y-3">
          <div className="text-amber-300 text-7xl font-extrabold tracking-tight drop-shadow-lg">
            404
          </div>
          <h1 className="text-3xl font-extrabold text-amber-100">
            Spiel nicht gefunden
          </h1>
          <p className="text-emerald-200/80 leading-relaxed">
            Dieses Spiel existiert nicht mehr — vermutlich ist die Runde
            vorbei oder der Code stimmt nicht.
          </p>
          {code ? (
            <p className="text-emerald-300/70 text-sm">
              Gesuchter Code:{" "}
              <span className="font-mono font-extrabold text-amber-300 tracking-widest">
                {code}
              </span>
            </p>
          ) : null}
        </div>

        <a
          href={homeUrl}
          className="inline-flex items-center gap-3 bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-emerald-950 font-extrabold text-lg px-8 py-4 rounded-2xl shadow-2xl shadow-amber-400/30 transition-all hover:scale-105 active:scale-95"
        >
          <span>🐻</span>
          <span>Zurück zur Startseite</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </div>
    </div>
  );
}
