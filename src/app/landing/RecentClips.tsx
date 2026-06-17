"use client";

import { useEffect, useState } from "react";

interface ApiClip {
	id: string;
	url: string;
	embedUrl: string;
	title: string;
	thumbnailUrl: string;
	viewCount: number;
	durationSec: number;
	createdAt: string;
	creatorName: string;
}

interface ApiResponse {
	login: string;
	clips: ApiClip[];
}

function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

export function RecentClips({ login = "lauchgruen", count = 6 }: { login?: string; count?: number }) {
	const [clips, setClips] = useState<ApiClip[] | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const response = await fetch(`/api/twitch/clips?login=${encodeURIComponent(login)}&count=${count}`, { cache: "no-store" });
				if (!response.ok) throw new Error(String(response.status));
				const json = (await response.json()) as ApiResponse;
				if (!cancelled) {
					setClips(json.clips ?? []);
					setLoading(false);
				}
			} catch {
				if (!cancelled) {
					setClips([]);
					setLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [login, count]);

	if (loading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: count }).map((_, index) => (
					<div key={index} className="animate-pulse rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-4">
						<div className="aspect-video w-full rounded-2xl bg-emerald-900/40" />
						<div className="mt-4 h-4 w-3/4 rounded-full bg-emerald-900/40" />
						<div className="mt-3 h-3 w-1/2 rounded-full bg-emerald-900/30" />
					</div>
				))}
			</div>
		);
	}

	if (!clips || clips.length === 0) {
		return (
			<div className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-6 text-sm leading-7 text-emerald-100/68">
				Noch keine Clips aus den letzten 30 Tagen. Sobald wieder live ist und der Chat den Highlight-Knopf drückt, tauchen sie hier auf.
			</div>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{clips.map((clip) => (
				<a
					key={clip.id}
					href={clip.url}
					target="_blank"
					rel="noreferrer"
					className="group flex flex-col overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/24 transition hover:-translate-y-0.5 hover:border-lime-200/30"
				>
					<div className="relative aspect-video overflow-hidden bg-emerald-950">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={clip.thumbnailUrl}
							alt={clip.title}
							className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/0" />
						<div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-lime-100 backdrop-blur">
							{formatDuration(clip.durationSec)}
						</div>
						<div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-bold text-emerald-100 backdrop-blur">
							{clip.viewCount.toLocaleString("de-DE")} Views
						</div>
					</div>

					<div className="flex flex-1 flex-col justify-between gap-3 p-4">
						<div className="line-clamp-2 text-sm font-black leading-snug text-emerald-50 group-hover:text-lime-100">{clip.title}</div>
						<div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100/52">
							<span>von {clip.creatorName}</span>
							<span>{formatDate(clip.createdAt)}</span>
						</div>
					</div>
				</a>
			))}
		</div>
	);
}
