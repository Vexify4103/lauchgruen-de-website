"use client";

import { useEffect, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { LastGameDetails } from "@/components/obs/shared/LastGameDetails";
import { queueLabel, rankLabel } from "@/components/obs/shared/utils";

export function HippokrateOverlay({ data, lpTone }: { data: LauchgruenObsResponse; lpTone: string }) {
	const [showLastGame, setShowLastGame] = useState(false);
	const lastGame = data.lastGames[0];

	useEffect(() => {
		if (!lastGame) return;
		const timer = window.setInterval(() => setShowLastGame((current) => !current), 30_000);
		return () => window.clearInterval(timer);
	}, [lastGame]);

	return (
		<div className="min-h-screen bg-transparent p-4 text-white">
			<div key={showLastGame ? `last-${lastGame?.matchId}` : "session"} className="hippo-scene w-[25rem] [text-shadow:0_2px_8px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,1)]">
				{showLastGame && lastGame ? <LastGameScene game={lastGame} /> : <SessionScene data={data} lpTone={lpTone} />}
			</div>
			<style>{`@keyframes hippo-scene-in { from { opacity: 0; transform: translateY(8px); filter: blur(4px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } } .hippo-scene { animation: hippo-scene-in 600ms ease-out; }`}</style>
		</div>
	);
}

function SessionScene({ data, lpTone }: { data: LauchgruenObsResponse; lpTone: string }) {
	return (
		<div>
			<div className="flex items-end gap-3">
				<div className="text-3xl font-black uppercase tracking-tight">{rankLabel(data.rank)}</div>
				<div className="pb-0.5 font-mono text-xl font-black text-amber-200">{data.rank?.leaguePoints ?? 0} LP</div>
				<div className="mb-0.5 rounded-full border border-cyan-200/35 bg-black/30 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-100">
					{queueLabel(data.rank?.queueType)}
				</div>
			</div>
			<div className="mt-2 flex items-center gap-5 font-mono font-black">
				<div>
					<span className="text-lime-300">{data.sessionWins}W</span>
					<span className="mx-1.5 text-white/55">/</span>
					<span className="text-rose-300">{data.sessionLosses}L</span>
				</div>
				<div className={lpTone}>
					{data.lpDelta > 0 ? "+" : ""}
					{data.lpDelta} LP
				</div>
				<div className="text-white/75">{data.winRate}% WR</div>
			</div>
			<div className="mt-4 flex gap-2">
				{data.lastGames.slice(0, 5).map((game) => (
					<div
						key={game.matchId}
						className={`relative size-14 overflow-hidden rounded-xl border-[3px] ${game.win ? "border-green-400 shadow-[0_0_16px_rgba(74,222,128,0.72)]" : "border-red-500 shadow-[0_0_16px_rgba(239,68,68,0.72)]"}`}
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
					</div>
				))}
			</div>
		</div>
	);
}

function LastGameScene({ game }: { game: LauchgruenObsResponse["lastGames"][number] }) {
	return (
		<div className="flex items-center gap-4">
			<div className={`relative size-28 shrink-0 overflow-hidden rounded-2xl border-2 ${game.win ? "border-lime-300" : "border-rose-400"} shadow-xl shadow-black/70`}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
			</div>
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<div className={`text-sm font-black uppercase tracking-[0.22em] ${game.win ? "text-lime-300" : "text-rose-300"}`}>
						{game.win ? "Letztes Game · Sieg" : "Letztes Game · Niederlage"}
					</div>
					<div className="rounded-full border border-cyan-200/30 bg-black/30 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100">
						{queueLabel(game.queueId)}
					</div>
				</div>
				<div className="mt-1 text-2xl font-black">{game.championName}</div>
				<LastGameDetails game={game} />
			</div>
		</div>
	);
}
