"use client";

import { useEffect, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { LauchgruenLastGameScene } from "@/components/obs/lauchgruen/LauchgruenLastGameScene";
import { LauchgruenRankScene } from "@/components/obs/lauchgruen/LauchgruenRankScene";

export function LauchgruenSmallOverlay({
	data,
	pulseKey,
	title,
	rankProgress,
	lpTone,
}: {
	data: LauchgruenObsResponse;
	pulseKey: number;
	title: string;
	rankProgress: number;
	lpTone: string;
}) {
	const [showLastGame, setShowLastGame] = useState(false);
	const hasGames = data.lastGames.length > 0;
	const gamesPlayed = data.sessionWins + data.sessionLosses;

	useEffect(() => {
		if (!hasGames) return;
		const timer = window.setInterval(() => setShowLastGame((current) => !current), 30_000);
		return () => window.clearInterval(timer);
	}, [hasGames]);

	return (
		<div className="flex min-h-screen items-start justify-start p-2">
			<div
				key={`${pulseKey}:${showLastGame ? "last-game" : "rank"}`}
				className="obs-performance-card relative h-[5.9rem] w-[22rem] overflow-hidden rounded-2xl border border-white/12 bg-[#171c1f]/92 px-3 py-2 text-emerald-50 shadow-2xl shadow-black/70 backdrop-blur-xl"
			>
				<div
					aria-hidden
					className="absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(190,242,100,0.16),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_42%)]"
				/>
				<div className="relative h-full">
					<LauchgruenRankScene
						active={!showLastGame || !hasGames}
						data={data}
						gamesPlayed={gamesPlayed}
						lpDelta={data.lpDelta}
						lpTone={lpTone}
						rankProgress={rankProgress}
						title={title}
					/>
					<LauchgruenLastGameScene active={showLastGame && hasGames} data={data} gamesPlayed={gamesPlayed} lpDelta={data.lpDelta} lpTone={lpTone} />
				</div>
				<style>{`
					@keyframes obs-rank-pulse { 0% { transform: scale(1); } 28% { transform: scale(1.008); box-shadow: 0 0 0 4px rgba(190,242,100,.12); } 100% { transform: scale(1); } }
					@keyframes obs-small-scene-in { 0% { opacity: 0; transform: translateX(18px) scale(.985); filter: blur(7px); } 60% { opacity: 1; transform: translateX(-2px) scale(1.004); filter: blur(0); } 100% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); } }
					.obs-performance-card { animation: obs-rank-pulse 700ms ease-out; }
					.obs-small-scene { transition: opacity 520ms ease, transform 520ms ease, filter 520ms ease; will-change: opacity, transform, filter; }
					.obs-small-scene-active { animation: obs-small-scene-in 680ms cubic-bezier(.2,.8,.2,1); }
				`}</style>
			</div>
		</div>
	);
}
