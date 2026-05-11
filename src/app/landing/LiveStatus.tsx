"use client";

/**
 * Live Twitch status card. Polls /api/twitch/status every 60 seconds and
 * renders one of two states:
 *
 *   • LIVE — pulsing red dot, stream thumbnail, title, game, viewer count,
 *            uptime, big "Live ansehen" CTA.
 *   • OFFLINE — calm offline-image / avatar fallback, "Folgen auf Twitch" CTA.
 *
 * Errors silently degrade to the offline view so the page never breaks.
 */

import { useEffect, useState } from "react";
import Image from "next/image";

interface ApiUser {
  id:              string;
  login:           string;
  displayName:     string;
  profileImageUrl: string;
  offlineImageUrl: string;
  description:     string;
}
interface ApiStream {
  id:           string;
  userName:     string;
  gameName:     string;
  title:        string;
  viewerCount:  number;
  startedAt:    string;
  thumbnailUrl: string;
  language:     string;
}
interface ApiResponse {
  login: string;
  live:  boolean;
  stream: ApiStream | null;
  user:   ApiUser   | null;
}

interface Props {
  login?: string;
  /** ms between polls. Default 60s. */
  pollIntervalMs?: number;
}

function formatUptime(startedAtIso: string): string {
  const started = new Date(startedAtIso).getTime();
  const elapsed = Math.max(0, Date.now() - started);
  const totalMin = Math.floor(elapsed / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}min`;
  return `${m}min`;
}

export function LiveStatus({
  login = "lauchgruentv",
  pollIntervalMs = 60_000,
}: Props) {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const r = await fetch(`/api/twitch/status?login=${encodeURIComponent(login)}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`${r.status}`);
        const json = (await r.json()) as ApiResponse;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchStatus();
    const t = setInterval(fetchStatus, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [login, pollIntervalMs]);

  // Re-render every minute so the uptime counter ticks even between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const twitchUrl = `https://twitch.tv/${login}`;

  // ─── Loading skeleton ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full max-w-2xl bg-emerald-950/60 border border-emerald-800 rounded-2xl p-6 flex items-center gap-4 animate-pulse">
        <div className="w-16 h-16 rounded-full bg-emerald-900" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-emerald-900 rounded w-1/3" />
          <div className="h-3 bg-emerald-900/70 rounded w-1/2" />
        </div>
      </div>
    );
  }

  // ─── LIVE ─────────────────────────────────────────────────────────────
  if (data?.live && data.stream) {
    const s = data.stream;
    return (
      <a
        href={twitchUrl}
        target="_blank"
        rel="noreferrer"
        className="group relative block w-full max-w-2xl rounded-2xl overflow-hidden border-2 border-red-500 shadow-2xl shadow-red-500/30 hover:shadow-red-500/50 transition-shadow"
      >
        {/* Thumbnail */}
        <div className="relative aspect-video bg-emerald-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.thumbnailUrl}
            alt={s.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
          />
          {/* Live badge */}
          <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-extrabold px-3 py-1.5 rounded flex items-center gap-2 shadow-lg uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            LIVE
          </div>
          {/* Viewer count */}
          <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-bold px-2.5 py-1.5 rounded flex items-center gap-1.5 backdrop-blur-sm">
            👁 {s.viewerCount.toLocaleString("de-DE")}
          </div>
          {/* Uptime */}
          <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs font-mono px-2.5 py-1.5 rounded backdrop-blur-sm">
            ⏱ {formatUptime(s.startedAt)}
          </div>
        </div>

        {/* Title + game */}
        <div className="bg-gradient-to-r from-emerald-950 to-emerald-900 px-5 py-4 flex items-center gap-4">
          {data.user?.profileImageUrl ? (
            <Image
              src={data.user.profileImageUrl}
              alt={data.user.displayName}
              width={48}
              height={48}
              className="rounded-full border-2 border-red-500 shrink-0"
              unoptimized
            />
          ) : null}
          <div className="flex-1 min-w-0">
            <div className="text-amber-300 font-extrabold text-lg truncate">
              {s.title}
            </div>
            <div className="text-emerald-200/80 text-sm">
              spielt <span className="text-amber-200 font-bold">{s.gameName}</span>
            </div>
          </div>
          <div className="bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-lg px-4 py-2 text-sm shrink-0 transition-colors">
            Live ansehen →
          </div>
        </div>
      </a>
    );
  }

  // ─── OFFLINE ──────────────────────────────────────────────────────────
  const user = data?.user;
  return (
    <div className="w-full max-w-2xl bg-emerald-950/60 border border-emerald-800 rounded-2xl p-6 flex items-center gap-5 backdrop-blur-sm">
      <div className="relative shrink-0">
        {user?.profileImageUrl ? (
          <Image
            src={user.profileImageUrl}
            alt={user.displayName}
            width={72}
            height={72}
            className="rounded-full border-2 border-emerald-700 grayscale"
            unoptimized
          />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full bg-emerald-900" />
        )}
        <div className="absolute bottom-0 right-0 bg-emerald-800 text-emerald-300 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border border-emerald-700">
          Offline
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-emerald-100 font-extrabold text-lg">
          Aktuell nicht live
        </div>
        <div className="text-emerald-300/70 text-sm">
          Folge auf Twitch, um beim nächsten Stream nichts zu verpassen.
        </div>
      </div>
      <a
        href={twitchUrl}
        target="_blank"
        rel="noreferrer"
        className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold rounded-lg px-4 py-2.5 text-sm shrink-0 transition-colors shadow-lg"
      >
        Twitch ↗
      </a>
    </div>
  );
}
