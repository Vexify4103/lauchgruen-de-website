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
      <div className="surface-panel rounded-[1.7rem] p-5">
        <div className="animate-pulse">
          <div className="aspect-video rounded-[1.35rem] bg-emerald-900/75" />
          <div className="mt-4 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-900/75" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-2/3 rounded-full bg-emerald-900/75" />
              <div className="h-3 w-1/3 rounded-full bg-emerald-900/55" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data?.live && data.stream) {
    const stream = data.stream;

    return (
      <a
        href={twitchUrl}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-[1.7rem] border border-red-400/45 bg-[#041b14] shadow-2xl shadow-black/20 transition-transform hover:-translate-y-0.5"
      >
        <div className="relative aspect-video bg-emerald-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stream.thumbnailUrl}
            alt={stream.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#04120d] via-transparent to-transparent" />

          <div className="absolute left-3 top-3 rounded-full bg-red-500 px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-white shadow-lg shadow-red-900/30">
            Live
          </div>
          <div className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
            {stream.viewerCount.toLocaleString("de-DE")} Zuschauer
          </div>
          <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
            Seit {formatUptime(stream.startedAt)}
          </div>
        </div>

        <div className="bg-gradient-to-r from-emerald-950 to-emerald-900/95 p-5">
          <div className="flex items-start gap-4">
            {data.user?.profileImageUrl ? (
              <Image
                src={data.user.profileImageUrl}
                alt={data.user.displayName}
                width={54}
                height={54}
                className="rounded-2xl border border-red-300/50 object-cover"
                unoptimized
              />
            ) : (
              <div className="h-[54px] w-[54px] rounded-2xl bg-emerald-900/75" />
            )}
            <div className="min-w-0 flex-1">
              <div className="section-kicker text-red-200/78">Jetzt live</div>
              <div className="mt-2 truncate text-xl font-black text-amber-100">
                {stream.title}
              </div>
              <div className="mt-2 text-sm text-emerald-100/72">
                spielt{" "}
                <span className="font-bold text-amber-200">{stream.gameName}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white transition-colors group-hover:bg-red-400">
              Reinschauen
            </div>
          </div>
        </div>
      </a>
    );
  }

  const user = data?.user;

  return (
    <div className="surface-panel rounded-[1.7rem] p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          {user?.profileImageUrl ? (
            <Image
              src={user.profileImageUrl}
              alt={user.displayName}
              width={64}
              height={64}
              className="rounded-2xl border border-emerald-300/18 object-cover grayscale"
              unoptimized
            />
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-emerald-900/70" />
          )}
          <div>
            <div className="section-kicker">Aktuell offline</div>
            <div className="mt-2 text-2xl font-black text-amber-100">
              Gerade nicht auf Sendung
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-emerald-100/72">
              Folge auf Twitch, damit der nachste Stream nicht nur zufallig in
              deiner Timeline vorbeifliegt.
            </p>
          </div>
        </div>
        <a
          href={twitchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-300 px-5 text-sm font-black uppercase tracking-[0.14em] text-emerald-950 transition-colors hover:bg-amber-300 sm:ml-auto"
        >
          Twitch folgen
        </a>
      </div>
    </div>
  );
}
