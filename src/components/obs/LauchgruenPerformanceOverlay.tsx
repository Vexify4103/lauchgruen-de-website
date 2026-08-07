"use client";

import { useEffect, useRef, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { AkumaOverlay } from "@/components/obs/AkumaOverlay";
import { N4cht4r4Overlay } from "@/components/obs/N4cht4r4Overlay";
import { RankPortraitOverlay } from "@/components/obs/RankPortraitOverlay";
import { NachtdienstOverlay } from "@/components/obs/NachtdienstOverlay";

const POLL_INTERVAL_MS = 20_000;

export function LauchgruenPerformanceOverlay({
	initial,
	variant = "full",
	endpoint = "/api/obs/lauchgruen",
	layout = "default",
	forceVisible = false,
}: {
	initial: LauchgruenObsResponse;
	variant?: "full" | "small";
	endpoint?: string;
	layout?: "default" | "hippokrate" | "rankPortrait" | "nachtdienst" | "akuma" | "n4cht4r4";
	forceVisible?: boolean;
}) {
	const [data, setData] = useState(initial);
	const [pulseKey, setPulseKey] = useState(0);
	const [displayDurationSeconds, setDisplayDurationSeconds] = useState(initial.streamDurationSeconds);
	const lastSignature = useRef(signature(initial));

	useEffect(() => {
		let cancelled = false;
		const tick = async () => {
			try {
				const response = await fetch(endpoint, { cache: "no-store" });
				if (!response.ok) return;
				const nextData = (await response.json()) as LauchgruenObsResponse;
				if (cancelled) return;
				const nextSignature = signature(nextData);
				if (nextSignature !== lastSignature.current) {
					lastSignature.current = nextSignature;
					setPulseKey((key) => key + 1);
				}
				setData(nextData);
			} catch {
				// OBS keeps polling; transient API hiccups should not flash the source.
			}
		};
		const timer = setInterval(tick, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [endpoint]);

	useEffect(() => {
		const baselineDuration = data.streamDurationSeconds;
		const baselineTime = Date.now();

		if (!data.online) return;

		const timer = setInterval(() => {
			const elapsedSeconds = Math.floor((Date.now() - baselineTime) / 1_000);
			setDisplayDurationSeconds(baselineDuration + elapsedSeconds);
		}, 1_000);

		return () => clearInterval(timer);
	}, [data.online, data.streamDurationSeconds]);

	const gamesPlayed = data.sessionWins + data.sessionLosses;
	const lpDelta = data.lpDelta;
	const lpTone = lpDelta > 0 ? "text-lime-200" : lpDelta < 0 ? "text-rose-300" : "text-emerald-100/70";
	const title = data.rank ? `Road to ${tierName(data.rank.nextTierLabel.split(" ")[0])}` : "Road to Ranked";
	const rankProgress = data.rank?.tierProgressPercent ?? 0;
	const shouldHideForCategory = data.online && !data.leagueLive;
	if (layout === "nachtdienst") {
		const rankedQueueLive = data.liveQueueId === 420 || data.liveQueueId === 440;
		if (!forceVisible && (!data.leagueLive || !rankedQueueLive)) return null;
		return <NachtdienstOverlay key={pulseKey} data={data} />;
	}
	if (layout === "rankPortrait") {
		if (!forceVisible && !data.leagueLive) return null;
		return (
			<RankPortraitOverlay
				riotId={data.riotId}
				profileIconUrl={data.profileIconUrl}
				rank={
					data.rank
						? {
								tier: data.rank.tier,
								division: data.rank.rank,
								leaguePoints: data.rank.leaguePoints,
								wins: data.rank.wins,
								losses: data.rank.losses,
							}
						: null
				}
				sessionWins={data.sessionWins}
				sessionLosses={data.sessionLosses}
			/>
		);
	}
	if (layout === "akuma") {
		if (!forceVisible && !data.leagueLive) return null;
		return <AkumaOverlay key={pulseKey} data={data} />;
	}
	if (layout === "n4cht4r4") {
		if (!forceVisible && !data.leagueLive) return null;
		return <N4cht4r4Overlay key={pulseKey} data={data} />;
	}

	// Keep the OBS browser source transparent when Twitch is live in another
	// category. Polling continues, so the overlay returns automatically for LoL.
	if (!forceVisible && shouldHideForCategory) return null;

	if (layout === "hippokrate") {
		return <HippokrateOverlay key={data.streamStartedAt ?? "offline"} data={data} lpDelta={lpDelta} lpTone={lpTone} />;
	}

	if (variant === "small") {
		return <SmallPerformanceOverlay data={data} gamesPlayed={gamesPlayed} lpDelta={lpDelta} lpTone={lpTone} pulseKey={pulseKey} rankProgress={rankProgress} title={title} />;
	}

	return (
		<div className="flex min-h-screen items-start justify-start p-3">
			<div
				key={pulseKey}
				className="obs-performance-card relative h-[19rem] w-[18.5rem] overflow-hidden rounded-2xl border border-white/12 bg-[#171c1f]/92 p-3 text-emerald-50 shadow-2xl shadow-black/70 backdrop-blur-xl"
			>
				<div
					aria-hidden
					className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(190,242,100,0.16),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_42%)]"
				/>
				<div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-lime-300/10 to-transparent" />

				<div className="relative">
					<div className="flex items-start justify-between gap-2">
						<div>
							<div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/64">{title}</div>
							<div className="mt-2 flex items-end gap-2">
								<div className="text-xl font-black leading-none text-white">{rankLabel(data.rank)}</div>
								<div className="rounded-md border border-amber-200/25 bg-amber-300/14 px-2 py-0.5 font-mono text-xs font-black text-amber-100">
									{data.rank?.leaguePoints ?? 0} LP
								</div>
							</div>
						</div>
						<LiveBadge online={data.online} leagueLive={data.leagueLive} />
					</div>

					<div className="mt-3">
						<div className="mb-1 flex items-center justify-between font-mono text-[9px] font-black uppercase tracking-[0.08em] text-emerald-100/44">
							<span>{data.rank ? `${tierName(data.rank.tier)} IV` : "Unranked"}</span>
							<span>{Math.round(rankProgress)}%</span>
							<span>{data.rank ? tierName(data.rank.nextTierLabel.split(" ")[0]) : "Next"}</span>
						</div>
						<div className="relative h-2 overflow-hidden rounded-full bg-black/42 ring-1 ring-white/10">
							<div
								className="h-full rounded-full bg-gradient-to-r from-amber-300 via-lime-300 to-cyan-200 shadow-[0_0_14px_rgba(190,242,100,0.45)]"
								style={{ width: `${rankProgress}%` }}
							/>
							<div className="absolute inset-0 grid grid-cols-4">
								{[0, 1, 2, 3].map((part) => (
									<div key={part} className="border-r border-black/45 last:border-r-0" />
								))}
							</div>
						</div>
					</div>

					<div className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/54">Letzte 5 Games</div>
					<div className="mt-1.5 grid grid-cols-5 gap-1.5">
						{[0, 1, 2, 3, 4].map((index) => {
							const game = data.lastGames[index];
							return game ? (
								<div
									key={game.matchId}
									className={`relative overflow-hidden rounded-lg border ${game.win ? "border-lime-300/70" : "border-rose-300/70"} bg-black/40`}
								>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img src={game.championIconUrl} alt={game.championName} className="aspect-square w-full object-cover" />
									<div
										className={`absolute bottom-0 right-0 rounded-tl-md px-1.5 py-0.5 text-[9px] font-black ${game.win ? "bg-lime-300 text-emerald-950" : "bg-rose-400 text-white"}`}
									>
										{game.win ? "W" : "L"}
									</div>
								</div>
							) : (
								<div key={index} className="aspect-square rounded-lg border border-white/8 bg-black/28" />
							);
						})}
					</div>

					<div className="mt-3 grid grid-cols-3 gap-1.5">
						<StatCard label="Session" value={`${data.sessionWins}W · ${data.sessionLosses}L`} />
						<StatCard label="Winrate" value={`${data.winRate}%`} />
						<StatCard label="Heute LP" value={`${lpDelta > 0 ? "+" : ""}${lpDelta}`} valueClassName={lpTone} />
					</div>

					<div className="mt-2.5 grid grid-cols-[1fr_auto] gap-1.5 rounded-xl border border-amber-200/16 bg-black/30 p-2">
						<div>
							<div className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-100/56">Timer</div>
							<div className="font-mono text-lg font-black leading-none text-amber-100">
								{formatDuration(data.online ? displayDurationSeconds : data.streamDurationSeconds)}
							</div>
						</div>
						<div className="min-w-14 border-l border-white/10 pl-2 text-right">
							<div className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-100/44">Games</div>
							<div className="font-mono text-lg font-black leading-none text-emerald-50">{gamesPlayed}</div>
						</div>
					</div>

					{data.message ? (
						<div className="mt-2 truncate rounded-lg border border-white/10 bg-black/26 px-2 py-1 text-[10px] font-bold text-emerald-100/62">{data.message}</div>
					) : null}
				</div>

				<style>{`
          @keyframes obs-rank-pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
            28% { transform: scale(1.012); box-shadow: 0 0 0 5px rgba(190, 242, 100, 0.14); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
          }
          .obs-performance-card { animation: obs-rank-pulse 700ms ease-out; }
        `}</style>
			</div>
		</div>
	);
}

function HippokrateOverlay({ data, lpDelta, lpTone }: { data: LauchgruenObsResponse; lpDelta: number; lpTone: string }) {
	const [showLastGame, setShowLastGame] = useState(false);
	const hasSessionGame = data.lastGames.length > 0;
	const showLastGameScene = hasSessionGame && showLastGame;

	useEffect(() => {
		if (!hasSessionGame) return;
		const timer = setInterval(() => setShowLastGame((current) => !current), 30_000);
		return () => clearInterval(timer);
	}, [hasSessionGame]);

	return (
		<div className="min-h-screen bg-transparent p-4 text-white">
			<div key={showLastGameScene ? "last-game" : "session"} className="hippo-scene w-[25rem] [text-shadow:0_2px_8px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,1)]">
				{showLastGameScene ? <HippokrateLastGame game={data.lastGames[0]} /> : <HippokrateSession data={data} lpDelta={lpDelta} lpTone={lpTone} />}
			</div>
			<style>{`
				@keyframes hippo-scene-in {
					from { opacity: 0; transform: translateY(8px); filter: blur(4px); }
					to { opacity: 1; transform: translateY(0); filter: blur(0); }
				}
				.hippo-scene { animation: hippo-scene-in 600ms ease-out; }
			`}</style>
		</div>
	);
}

function HippokrateSession({ data, lpDelta, lpTone }: { data: LauchgruenObsResponse; lpDelta: number; lpTone: string }) {
	return (
		<div>
			<div className="flex items-end gap-3">
				<div className="text-3xl font-black uppercase tracking-tight">{rankLabel(data.rank)}</div>
				<div className="pb-0.5 font-mono text-xl font-black text-amber-200">{data.rank?.leaguePoints ?? 0} LP</div>
			</div>
			<div className="mt-2 flex items-center gap-5 font-mono font-black">
				<div>
					<span className="text-lime-300">{data.sessionWins}W</span>
					<span className="mx-1.5 text-white/55">/</span>
					<span className="text-rose-300">{data.sessionLosses}L</span>
				</div>
				<div className={lpTone}>
					{lpDelta > 0 ? "+" : ""}
					{lpDelta} LP
				</div>
				<div className="text-white/75">{data.winRate}% WR</div>
			</div>
			<div className="mt-4 flex gap-2">
				{data.lastGames.slice(0, 5).map((game) => (
					<div
						key={game.matchId}
						className={`relative size-14 overflow-hidden rounded-xl border-[3px] ${
							game.win ? "border-green-400 shadow-[0_0_16px_rgba(74,222,128,0.72)]" : "border-red-500 shadow-[0_0_16px_rgba(239,68,68,0.72)]"
						}`}
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
					</div>
				))}
			</div>
		</div>
	);
}

function HippokrateLastGame({ game }: { game?: LauchgruenObsResponse["lastGames"][number] }) {
	if (!game) return null;
	const minutes = Math.floor(game.durationSeconds / 60);
	const seconds = game.durationSeconds % 60;
	return (
		<div className="flex items-center gap-4">
			<div className={`relative size-28 shrink-0 overflow-hidden rounded-2xl border-2 ${game.win ? "border-lime-300" : "border-rose-400"} shadow-xl shadow-black/70`}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
			</div>
			<div className="min-w-0">
				<div className={`text-sm font-black uppercase tracking-[0.22em] ${game.win ? "text-lime-300" : "text-rose-300"}`}>
					{game.win ? "Letztes Game · Sieg" : "Letztes Game · Niederlage"}
				</div>
				<div className="mt-1 text-2xl font-black">{game.championName}</div>
				<div className="mt-1 flex gap-4 font-mono text-sm font-bold text-white/85">
					<span className="text-lg text-white">{game.kda} KDA</span>
					<span>{game.creepScore} CS</span>
					<span>{(game.goldEarned / 1000).toFixed(1)}k Gold</span>
					<span>
						{minutes}:{String(seconds).padStart(2, "0")}
					</span>
				</div>
				<div className="mt-3 flex min-h-10 gap-1.5">
					{game.items.map((item, index) => (
						<div key={`${item.id}-${index}`} className="size-10 overflow-hidden rounded-lg border border-white/30 shadow-md shadow-black/70">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function LiveBadge({ online, leagueLive }: { online: boolean; leagueLive: boolean }) {
	const label = !online ? "Offline" : leagueLive ? "LoL Live" : "Live";
	const tone = !online
		? "border-white/10 bg-white/8 text-emerald-100/52"
		: leagueLive
			? "border-lime-300/30 bg-lime-300/14 text-lime-100"
			: "border-amber-300/28 bg-amber-300/12 text-amber-100";
	return (
		<div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${tone}`}>
			<span className={`size-1.5 rounded-full ${online ? "animate-pulse bg-red-400" : "bg-emerald-100/30"}`} />
			{label}
		</div>
	);
}

function SmallPerformanceOverlay({
	data,
	gamesPlayed,
	lpDelta,
	lpTone,
	pulseKey,
	rankProgress,
	title,
}: {
	data: LauchgruenObsResponse;
	gamesPlayed: number;
	lpDelta: number;
	lpTone: string;
	pulseKey: number;
	rankProgress: number;
	title: string;
}) {
	const [showChampions, setShowChampions] = useState(false);
	const hasGames = data.lastGames.length > 0;

	useEffect(() => {
		const timer = setInterval(() => setShowChampions((current) => !current), 30_000);
		return () => clearInterval(timer);
	}, []);

	return (
		<div className="flex min-h-screen items-start justify-start p-2">
			<div
				key={`${pulseKey}:${showChampions ? "champions" : "rank"}`}
				className="obs-performance-card relative h-[5.9rem] w-[22rem] overflow-hidden rounded-2xl border border-white/12 bg-[#171c1f]/92 px-3 py-2 text-emerald-50 shadow-2xl shadow-black/70 backdrop-blur-xl"
			>
				<div
					aria-hidden
					className="absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(190,242,100,0.16),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_42%)]"
				/>
				<div className="relative h-full">
					<SmallRankScene
						active={!showChampions || !hasGames}
						data={data}
						gamesPlayed={gamesPlayed}
						lpDelta={lpDelta}
						lpTone={lpTone}
						rankProgress={rankProgress}
						title={title}
					/>
					<SmallChampionScene active={showChampions && hasGames} data={data} gamesPlayed={gamesPlayed} lpDelta={lpDelta} lpTone={lpTone} />
				</div>

				<style>{`
          @keyframes obs-rank-pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
            28% { transform: scale(1.008); box-shadow: 0 0 0 4px rgba(190, 242, 100, 0.12); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
          }
          @keyframes obs-small-scene-in {
            0% { opacity: 0; transform: translateX(18px) scale(0.985); filter: blur(7px); }
            60% { opacity: 1; transform: translateX(-2px) scale(1.004); filter: blur(0); }
            100% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
          }
          .obs-performance-card { animation: obs-rank-pulse 700ms ease-out; }
          .obs-small-scene {
            transition: opacity 520ms ease, transform 520ms ease, filter 520ms ease;
            will-change: opacity, transform, filter;
          }
          .obs-small-scene-active { animation: obs-small-scene-in 680ms cubic-bezier(.2,.8,.2,1); }
        `}</style>
			</div>
		</div>
	);
}

function SmallRankScene({
	active,
	data,
	gamesPlayed,
	lpDelta,
	lpTone,
	rankProgress,
	title,
}: {
	active: boolean;
	data: LauchgruenObsResponse;
	gamesPlayed: number;
	lpDelta: number;
	lpTone: string;
	rankProgress: number;
	title: string;
}) {
	return (
		<div
			className={`obs-small-scene absolute inset-0 flex h-full flex-col justify-between ${active ? "obs-small-scene-active opacity-100 blur-0" : "pointer-events-none translate-x-[-16px] opacity-0 blur-md"}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-[9px] font-black uppercase tracking-[0.22em] text-emerald-100/56">{title}</div>
					<div className="mt-1 flex items-baseline gap-2">
						<div className="text-lg font-black leading-none text-white">{rankLabel(data.rank)}</div>
						<div className="rounded-md border border-amber-200/22 bg-amber-300/14 px-2 py-0.5 font-mono text-xs font-black text-amber-100">
							{data.rank?.leaguePoints ?? 0} LP
						</div>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<div className={`rounded-full border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs font-black ${lpTone}`}>
						{lpDelta > 0 ? "+" : ""}
						{lpDelta} LP
					</div>
				</div>
			</div>

			<div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
				<div>
					<div className="mb-1 flex items-center justify-between font-mono text-[8px] font-black uppercase tracking-[0.08em] text-emerald-100/38">
						<span>{data.rank ? `${tierName(data.rank.tier)} IV` : "Unranked"}</span>
						<span>{Math.round(rankProgress)}%</span>
						<span>{data.rank ? tierName(data.rank.nextTierLabel.split(" ")[0]) : "Next"}</span>
					</div>
					<div className="relative h-2 overflow-hidden rounded-full bg-black/42 ring-1 ring-white/10">
						<div
							className="h-full rounded-full bg-gradient-to-r from-amber-300 via-lime-300 to-cyan-200 shadow-[0_0_14px_rgba(190,242,100,0.45)]"
							style={{ width: `${rankProgress}%` }}
						/>
						<div className="absolute inset-0 grid grid-cols-4">
							{[0, 1, 2, 3].map((part) => (
								<div key={part} className="border-r border-black/45 last:border-r-0" />
							))}
						</div>
					</div>
				</div>
				<div className="text-right">
					<div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/38">Session</div>
					<div className="font-mono text-sm font-black text-emerald-50">
						{data.sessionWins}W · {data.sessionLosses}L
					</div>
				</div>
				<div className="text-right">
					<div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/38">Games</div>
					<div className="font-mono text-sm font-black text-emerald-50">{gamesPlayed}</div>
				</div>
			</div>
		</div>
	);
}

function SmallChampionScene({
	active,
	data,
	gamesPlayed,
	lpDelta,
	lpTone,
}: {
	active: boolean;
	data: LauchgruenObsResponse;
	gamesPlayed: number;
	lpDelta: number;
	lpTone: string;
}) {
	const featured = data.lastGames[0];
	return (
		<div
			className={`obs-small-scene absolute inset-0 grid h-full grid-cols-[auto_1fr_auto] items-center gap-3 ${active ? "obs-small-scene-active opacity-100 blur-0" : "pointer-events-none translate-x-[16px] opacity-0 blur-md"}`}
		>
			{featured ? (
				<div
					className={`relative size-16 overflow-hidden rounded-xl border-2 ${featured.win ? "border-lime-300 shadow-[0_0_16px_rgba(132,204,22,0.5)]" : "border-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.45)]"}`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={featured.championIconUrl} alt={featured.championName} className="size-full object-cover" />
					<div
						className={`absolute bottom-0 right-0 rounded-tl-md px-1.5 py-0.5 text-[9px] font-black ${featured.win ? "bg-lime-300 text-emerald-950" : "bg-rose-400 text-white"}`}
					>
						{featured.win ? "W" : "L"}
					</div>
				</div>
			) : (
				<div className="size-16 rounded-xl border border-white/10 bg-black/30" />
			)}

			<div className="min-w-0">
				<div className="truncate text-[9px] font-black uppercase tracking-[0.22em] text-emerald-100/52">Letzte Champions</div>
				<div className="mt-1 flex items-center gap-1.5">
					{[0, 1, 2, 3, 4].map((index) => {
						const game = data.lastGames[index];
						return game ? (
							<div
								key={game.matchId}
								className={`relative size-8 overflow-hidden rounded-lg border ${game.win ? "border-lime-300/80" : "border-rose-400/80"} bg-black/40`}
							>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
							</div>
						) : (
							<div key={index} className="size-8 rounded-lg border border-white/8 bg-black/26" />
						);
					})}
				</div>
				<div className="mt-1 truncate font-mono text-xs font-black text-white">{featured ? `${featured.championName} · ${featured.kda} KDA` : "Noch keine Games"}</div>
			</div>

			<div className="shrink-0 text-right">
				<div className="font-mono text-sm font-black text-emerald-50">
					{data.sessionWins}W · {data.sessionLosses}L
				</div>
				<div className={`mt-1 font-mono text-xs font-black ${lpTone}`}>
					{lpDelta > 0 ? "+" : ""}
					{lpDelta} LP
				</div>
				<div className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/36">{gamesPlayed} Games</div>
			</div>
		</div>
	);
}

function StatCard({ label, value, valueClassName = "text-emerald-50" }: { label: string; value: string; valueClassName?: string }) {
	return (
		<div className="rounded-lg border border-white/8 bg-black/28 px-2 py-1.5 text-center">
			<div className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-100/38">{label}</div>
			<div className={`mt-0.5 font-mono text-sm font-black leading-none ${valueClassName}`}>{value}</div>
		</div>
	);
}

function rankLabel(rank: LauchgruenObsResponse["rank"]) {
	if (!rank) return "Unranked";
	return `${tierName(rank.tier)} ${rank.rank}`;
}

function tierName(tier?: string) {
	if (!tier) return "Unranked";
	const map: Record<string, string> = {
		IRON: "Iron",
		BRONZE: "Bronze",
		SILVER: "Silber",
		GOLD: "Gold",
		PLATINUM: "Platin",
		EMERALD: "Emerald",
		DIAMOND: "Diamond",
		MASTER: "Master",
		GRANDMASTER: "Grandmaster",
		CHALLENGER: "Challenger",
	};
	return map[tier.toUpperCase()] ?? tier;
}

function formatDuration(seconds: number) {
	const safe = Math.max(0, seconds);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const secs = safe % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function signature(data: LauchgruenObsResponse) {
	return JSON.stringify({
		online: data.online,
		leagueLive: data.leagueLive,
		rank: data.rank?.score ?? null,
		lp: data.lpDelta,
		w: data.sessionWins,
		l: data.sessionLosses,
		games: data.lastGames.map((game) => `${game.matchId}:${game.win}`).join("|"),
	});
}
