"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

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
	const elapsed = Math.max(0, Date.now() - new Date(startedAtIso).getTime());
	const totalMinutes = Math.floor(elapsed / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return hours ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

const shellClass = "group relative flex h-full min-h-[27rem] overflow-hidden rounded-[2.6rem] border border-white/10 bg-[#04140d] shadow-2xl shadow-black/30 sm:min-h-[30rem] lg:min-h-[32rem]";

export function LiveStatus({ login = "lauchgruen", pollIntervalMs = 60_000 }: Props) {
	const [data, setData] = useState<ApiResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [, setTick] = useState(0);

	useEffect(() => {
		let cancelled = false;
		async function fetchStatus() {
			try {
				const response = await fetch(`/api/twitch/status?login=${encodeURIComponent(login)}`, { cache: "no-store" });
				if (!response.ok) throw new Error(String(response.status));
				const result = (await response.json()) as ApiResponse;
				if (!cancelled) setData(result);
			} catch {
				if (!cancelled) setData(null);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		void fetchStatus();
		const poller = window.setInterval(fetchStatus, pollIntervalMs);
		return () => {
			cancelled = true;
			window.clearInterval(poller);
		};
	}, [login, pollIntervalMs]);

	useEffect(() => {
		const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
		return () => window.clearInterval(timer);
	}, []);

	if (loading) return <LoadingState />;
	if (data?.live && data.stream) return <LiveState data={data} login={login} />;
	return <OfflineState user={data?.user ?? null} login={login} />;
}

function LoadingState() {
	return (
		<div className={`${shellClass} animate-pulse`}>
			<div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(6,78,59,0.45),rgba(2,11,7,0.92))]" />
			<div className="relative mt-auto w-full p-6">
				<div className="h-3 w-24 rounded-full bg-emerald-100/10" />
				<div className="mt-4 h-7 w-4/5 rounded-full bg-emerald-100/10" />
				<div className="mt-3 h-4 w-2/5 rounded-full bg-emerald-100/8" />
			</div>
		</div>
	);
}

function LiveState({ data, login }: { data: ApiResponse; login: string }) {
	const stream = data.stream!;
	return (
		<a href={`https://twitch.tv/${login}`} target="_blank" rel="noreferrer" className={`${shellClass} flex-col`}>
			<div className="relative aspect-video w-full shrink-0 overflow-hidden border-b border-white/10 bg-black">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={stream.thumbnailUrl} alt={stream.title} className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.035]" />
				<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,9,6,0.04),rgba(2,9,6,0.18)_65%,rgba(2,9,6,0.58))]" />
				<div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
					<span className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-red-950/30">
						<span className="size-1.5 animate-pulse rounded-full bg-white" /> Live
					</span>
					<div className="flex flex-wrap justify-end gap-2">
						<span className="rounded-full border border-white/12 bg-black/62 px-3 py-1.5 text-[9px] font-bold text-white backdrop-blur-md">{stream.viewerCount.toLocaleString("de-DE")} Zuschauer</span>
						<span className="rounded-full border border-white/12 bg-black/62 px-3 py-1.5 text-[9px] font-bold text-white backdrop-blur-md">{formatUptime(stream.startedAt)}</span>
					</div>
				</div>
				<div className="absolute inset-x-0 bottom-0 h-1 bg-[#9146ff] shadow-[0_0_14px_rgba(145,70,255,0.6)]" />
			</div>

			<div className="relative flex min-h-0 flex-1 flex-col p-5 sm:p-6">
				<div className="flex items-center gap-4">
					{data.user?.profileImageUrl ? (
						<Image src={data.user.profileImageUrl} alt={data.user.displayName} width={54} height={54} priority unoptimized className="size-[54px] shrink-0 rounded-2xl border-2 border-red-400/75 object-cover shadow-xl shadow-black/45" />
					) : null}
					<div className="min-w-0 flex-1">
						<div className="text-[9px] font-black uppercase tracking-[0.24em] text-lime-200/72">{stream.gameName}</div>
						<div className="mt-1 truncate text-xs font-bold text-emerald-100/42">{data.user?.displayName ?? stream.userName}</div>
					</div>
				</div>
				<h3 className="mt-5 line-clamp-2 text-xl font-black leading-tight text-white sm:text-2xl">{stream.title}</h3>
				<div className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-4">
					<span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/48">twitch.tv/{login}</span>
					<span className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-100 transition group-hover:translate-x-1">Jetzt ansehen →</span>
				</div>
			</div>
		</a>
	);
}

function OfflineState({ user, login }: { user: ApiUser | null; login: string }) {
	return (
		<a href={`https://twitch.tv/${login}`} target="_blank" rel="noreferrer" className={shellClass}>
			{user?.offlineImageUrl ? (
				<>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={user.offlineImageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-22 grayscale transition duration-500 group-hover:scale-[1.035]" />
					<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,16,10,0.45),rgba(3,16,10,0.94))]" />
				</>
			) : (
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(163,230,53,0.12),transparent_35%),linear-gradient(145deg,#082218,#020b07)]" />
			)}
			<div aria-hidden className="absolute -right-20 top-12 size-72 rounded-full border border-lime-200/8" />
			<div aria-hidden className="absolute -right-8 top-24 size-52 rounded-full border border-cyan-200/7" />

			<div className="relative flex w-full flex-col justify-between p-6 sm:p-7">
				<div className="flex items-center justify-between gap-3">
					<span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100/55">Aktuell offline</span>
					<span className="size-2 rounded-full bg-emerald-100/20" />
				</div>

				<div className="my-auto py-10">
					{user?.profileImageUrl ? <Image src={user.profileImageUrl} alt={user.displayName} width={72} height={72} priority unoptimized className="size-[72px] rounded-[1.4rem] border border-lime-200/18 object-cover grayscale shadow-2xl shadow-black/40" /> : null}
					<div className="mt-6 text-[9px] font-black uppercase tracking-[0.28em] text-lime-200/50">Nächster Stream</div>
					<h3 className="mt-3 max-w-sm text-3xl font-black leading-[0.98] tracking-[-0.035em]">Noch nichts live. Aber meistens nicht lange.</h3>
					<p className="mt-4 max-w-sm text-sm leading-7 text-emerald-100/52">Auf Twitch folgen und die Benachrichtigung aktivieren, damit der nächste Abend nicht ohne dich startet.</p>
				</div>

				<div className="flex items-center justify-between gap-4 border-t border-white/8 pt-4">
					<span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-100/35">twitch.tv/{login}</span>
					<span className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-100 transition group-hover:translate-x-1">Kanal öffnen →</span>
				</div>
			</div>
		</a>
	);
}
