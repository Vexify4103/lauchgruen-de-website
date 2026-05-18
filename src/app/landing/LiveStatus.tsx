"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface ApiUser {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  offlineImageUrl: string;
  description: string;
}

interface ApiStream {
  id: string;
  userName: string;
  gameName: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  thumbnailUrl: string;
  language: string;
}

interface ApiResponse {
  login: string;
  live: boolean;
  stream: ApiStream | null;
  user: ApiUser | null;
}

interface Props {
  login?: string;
  pollIntervalMs?: number;
}

function formatUptime(startedAtIso: string): string {
  const started = new Date(startedAtIso).getTime();
  const elapsed = Math.max(0, Date.now() - started);
  const totalMin = Math.floor(elapsed / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}

const cardClasses =
  "group flex min-h-[34rem] w-full flex-col overflow-hidden rounded-[1.95rem] border border-emerald-300/14 bg-[#041b14] shadow-2xl shadow-black/20";

const mediaShellClasses =
  "relative aspect-video overflow-hidden rounded-[1.55rem] border border-white/10 bg-emerald-950";

export function LiveStatus({
  login = "lauchgruen",
  pollIntervalMs = 60_000,
}: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const response = await fetch(
          `/api/twitch/status?login=${encodeURIComponent(login)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`${response.status}`);

        const json = (await response.json()) as ApiResponse;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchStatus();
    const timer = setInterval(fetchStatus, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [login, pollIntervalMs]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const twitchUrl = `https://twitch.tv/${login}`;

  if (loading) {
    return (
      <div className={cardClasses}>
        <div className="animate-pulse p-5 sm:p-6">
          <div className={`${mediaShellClasses} bg-emerald-900/75`} />
          <div className="mt-5 flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-900/75" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-4 w-2/3 rounded-full bg-emerald-900/75" />
              <div className="h-3 w-1/2 rounded-full bg-emerald-900/55" />
              <div className="h-10 w-32 rounded-2xl bg-emerald-900/55" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data?.live && data.stream) {
    const stream = data.stream;

    return (
      <a href={twitchUrl} target="_blank" rel="noreferrer" className={cardClasses}>
        <div className="p-5 sm:p-6">
          <div className={mediaShellClasses}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stream.thumbnailUrl}
              alt={stream.title}
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-28 blur-2xl transition-transform duration-300 group-hover:scale-[1.08]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0b2d20]/30 via-[#04120d]/8 to-[#04120d]/72" />
            <div className="absolute inset-4 overflow-hidden rounded-[1.25rem] border border-white/12 shadow-2xl shadow-black/45">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stream.thumbnailUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </div>

            <div className="absolute left-4 top-4 rounded-full bg-red-500 px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-white shadow-lg shadow-red-900/30">
              Live
            </div>
            <div className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
              {stream.viewerCount.toLocaleString("de-DE")} Zuschauer
            </div>
            <div className="absolute bottom-4 right-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
              Seit {formatUptime(stream.startedAt)}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between border-t border-emerald-300/10 bg-gradient-to-r from-emerald-950 to-emerald-900/95 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            {data.user?.profileImageUrl ? (
              <Image
                src={data.user.profileImageUrl}
                alt={data.user.displayName}
                width={58}
                height={58}
                className="h-[58px] w-[58px] rounded-2xl border border-red-300/40 object-cover"
                unoptimized
              />
            ) : (
              <div className="h-[58px] w-[58px] rounded-2xl bg-emerald-900/75" />
            )}

            <div className="min-w-0 flex-1">
              <div className="section-kicker text-red-200/78">Jetzt live</div>
              <div className="mt-2 line-clamp-2 text-2xl font-black leading-tight text-emerald-50">
                {stream.title}
              </div>
              <div className="mt-3 text-sm leading-6 text-emerald-100/72">
                spielt <span className="font-bold text-lime-200">{stream.gameName}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.22em] text-emerald-300/54">
              twitch.tv/{login}
            </div>
            <div className="inline-flex items-center justify-center rounded-2xl bg-red-500 px-5 py-3 text-sm font-black text-white transition-colors group-hover:bg-red-400">
              Reinschauen
            </div>
          </div>
        </div>
      </a>
    );
  }

  const user = data?.user;
  const offlineImage = user?.offlineImageUrl || user?.profileImageUrl || null;

  return (
    <a href={twitchUrl} target="_blank" rel="noreferrer" className={cardClasses}>
      <div className="p-5 sm:p-6">
        <div className={mediaShellClasses}>
          {offlineImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={offlineImage}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 size-full scale-105 object-cover opacity-30 blur-2xl grayscale"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 via-emerald-950/40 to-emerald-950/85" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-950 to-[#04120d]" />
          )}

          <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-emerald-100 backdrop-blur">
            Offline
          </div>

          <div className="absolute inset-x-6 bottom-6 text-center">
            <div className="text-xl font-black text-emerald-50 sm:text-2xl">
              Gerade nicht auf Sendung
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-6 border-t border-emerald-300/10 bg-gradient-to-r from-emerald-950 to-emerald-900/95 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {user?.profileImageUrl ? (
            <Image
              src={user.profileImageUrl}
              alt={user.displayName}
              width={58}
              height={58}
              className="size-[58px] shrink-0 rounded-2xl border border-emerald-300/18 object-cover grayscale"
              unoptimized
            />
          ) : (
            <div className="size-[58px] shrink-0 rounded-2xl bg-emerald-900/75" />
          )}

          <div className="min-w-0 flex-1">
            <div className="section-kicker">Aktuell offline</div>
            <div className="mt-2 truncate text-2xl font-black leading-tight text-emerald-50">
              {user?.displayName ?? "lauchgruen"}
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-100/68">
              Folge auf Twitch, damit dir der nächste Stream nicht vorbeirutscht.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300/54">
            twitch.tv/{login}
          </div>
          <div className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-emerald-950 transition-colors group-hover:from-lime-100 group-hover:to-cyan-100">
            Twitch folgen
          </div>
        </div>
      </div>
    </a>
  );
}
