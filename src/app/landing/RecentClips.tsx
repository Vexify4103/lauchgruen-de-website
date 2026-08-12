"use client";

import { useEffect, useState } from "react";
import { TwitchClipCard, type TwitchClipCardData } from "@/components/TwitchClipCard";

interface ApiResponse {
	login: string;
	clips: TwitchClipCardData[];
	usedPopularFallback?: boolean;
}

export function RecentClips({ login = "lauchgruen", count = 6 }: { login?: string; count?: number }) {
	const [clips, setClips] = useState<TwitchClipCardData[] | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const response = await fetch(`/api/twitch/clips?login=${encodeURIComponent(login)}&count=${count}&homepage=1`, { cache: "no-store" });
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
				<TwitchClipCard key={clip.id} clip={clip} />
			))}
		</div>
	);
}
