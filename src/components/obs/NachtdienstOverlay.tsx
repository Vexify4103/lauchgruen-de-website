"use client";

import { useEffect, useState } from "react";

import type { LauchgruenObsResponse } from "@/lib/streamer-obs";

export function NachtdienstOverlay({ data }: { data: LauchgruenObsResponse }) {
	const [showLastGame, setShowLastGame] = useState(false);
	const queue = data.liveQueueId === 440 ? "FLEX Q" : "SOLO Q";
	const name = data.riotId.split("#")[0] || "Nacktdienst";
	const games = data.sessionWins + data.sessionLosses;
	const lpDelta = data.lpDelta;
	const lastGame = data.lastGames[0];
	const lastGameId = lastGame?.matchId;

	useEffect(() => {
		if (!lastGameId) return;
		const timer = window.setInterval(() => setShowLastGame((current) => !current), 30_000);
		return () => window.clearInterval(timer);
	}, [lastGameId]);

	return (
		<div className="pointer-events-none fixed inset-0 overflow-hidden bg-transparent text-white">
			<section className="nachtdienst-hud absolute bottom-[18px] left-[18px] h-[178px] w-[520px]">
				<div
					aria-hidden
					className="absolute inset-0 bg-[linear-gradient(105deg,rgba(15,8,27,.96)_0%,rgba(26,10,42,.94)_58%,rgba(46,20,17,.91)_100%)] [clip-path:polygon(0_0,96%_0,100%_18%,100%_100%,4%_100%,0_82%)]"
				/>
				<div aria-hidden className="nachtdienst-grid absolute inset-[1px] opacity-30 [clip-path:polygon(0_0,96%_0,100%_18%,100%_100%,4%_100%,0_82%)]" />
				<div aria-hidden className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-[#9146ff] via-[#ffd84d] to-[#ff7a2f] shadow-[0_0_12px_#9146ff]" />
				<div aria-hidden className="absolute bottom-0 left-5 right-3 h-px bg-gradient-to-r from-[#ff7a2f] via-[#9146ff]/65 to-transparent" />

				{showLastGame && lastGame ? (
					<LastGameScene game={lastGame} queue={queue} />
				) : (
					<div className="nachtdienst-scene relative grid h-full grid-cols-[92px_1fr] gap-3 px-4 py-3">
						<div className="flex flex-col items-center justify-center border-r border-[#b784ff]/20 pr-3">
							<div className="relative size-[72px]">
								<div aria-hidden className="nachtdienst-orbit absolute -inset-2 rounded-full border border-dashed border-[#ffd84d]/50" />
								<div className="relative size-full overflow-hidden rounded-full border-2 border-[#9146ff] bg-[#140a20] shadow-[0_0_22px_rgba(145,70,255,.62)]">
									{data.profileIconUrl ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={data.profileIconUrl} alt="" className="size-full object-cover" />
									) : (
										<div className="grid size-full place-items-center text-2xl font-black text-[#ffd84d]">N</div>
									)}
								</div>
								<span className="absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-[#160b22] bg-[#ffd84d] shadow-[0_0_12px_#ffd84d]" />
							</div>
							<div className="mt-2 text-center text-[8px] font-black uppercase tracking-[0.24em] text-[#c9a7ff]">On shift</div>
						</div>

						<div className="min-w-0">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.28em] text-[#c9a7ff]">
										<span className="size-1.5 animate-pulse rounded-full bg-[#ffd84d] shadow-[0_0_8px_#ffd84d]" />
										Nachtschicht // Ranked Signal
									</div>
									<div className="mt-1 truncate text-[24px] font-black leading-none tracking-[-0.03em]">{name}</div>
								</div>
								<div className="shrink-0 border-l border-[#ff7a2f]/35 pl-3 text-right">
									<div className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff9b61]">{queue}</div>
									<div className="mt-1 font-mono text-[17px] font-black leading-none text-[#ffd84d]">
										{rankLabel(data.rank)} <span className="text-[12px] text-white/80">{data.rank?.leaguePoints ?? 0} LP</span>
									</div>
								</div>
							</div>

							<div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-3 border-y border-white/8 bg-black/20 px-2 py-1.5">
								<div>
									<div className="text-[7px] font-black uppercase tracking-[0.22em] text-white/40">Session</div>
									<div className="mt-0.5 font-mono text-[15px] font-black">
										<span className="text-[#ffd84d]">{data.sessionWins}W</span>
										<span className="mx-1.5 text-white/28">/</span>
										<span className="text-[#ff7a2f]">{data.sessionLosses}L</span>
									</div>
								</div>
								<Metric label="Winrate" value={`${games ? data.winRate : 0}%`} />
								<Metric
									label="LP Delta"
									value={`${lpDelta > 0 ? "+" : ""}${lpDelta}`}
									tone={lpDelta > 0 ? "text-[#ffd84d]" : lpDelta < 0 ? "text-[#ff7a2f]" : "text-white/70"}
								/>
							</div>

							<div className="mt-2 flex items-center gap-2">
								<div className="mr-1 w-12 text-[7px] font-black uppercase leading-tight tracking-[0.18em] text-[#c9a7ff]/70">
									Recent
									<br />
									signal
								</div>
								{[0, 1, 2, 3, 4].map((index) => {
									const game = data.lastGames[index];
									return game ? (
										<div
											key={game.matchId}
											className={`relative size-[36px] overflow-hidden border bg-black/35 ${game.win ? "border-[#ffd84d]/80" : "border-[#ff7a2f]/85"}`}
										>
											{/* eslint-disable-next-line @next/next/no-img-element */}
											<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
											<div className={`absolute inset-x-0 bottom-0 h-1 ${game.win ? "bg-[#ffd84d]" : "bg-[#ff7a2f]"}`} />
										</div>
									) : (
										<div key={index} className="size-[36px] border border-white/8 bg-black/20" />
									);
								})}
								<div className="ml-auto text-right font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-white/32">
									ND-{String(games).padStart(2, "0")}
								</div>
							</div>
						</div>
					</div>
				)}

				<style>{`
					@keyframes nachtdienst-enter { from { opacity: 0; transform: translateX(-26px); filter: blur(8px); } to { opacity: 1; transform: translateX(0); filter: blur(0); } }
					@keyframes nachtdienst-scene-enter { from { opacity: 0; transform: translateX(-18px); filter: blur(4px); } to { opacity: 1; transform: translateX(0); filter: blur(0); } }
					@keyframes nachtdienst-orbit { to { transform: rotate(360deg); } }
					@keyframes nachtdienst-scan { from { background-position: 0 0; } to { background-position: 34px 0; } }
					.nachtdienst-hud { animation: nachtdienst-enter 720ms cubic-bezier(.18,.8,.2,1) both; filter: drop-shadow(0 14px 28px rgba(0,0,0,.72)); }
					.nachtdienst-scene { animation: nachtdienst-scene-enter 620ms cubic-bezier(.18,.8,.2,1) both; }
					.nachtdienst-orbit { animation: nachtdienst-orbit 14s linear infinite; }
					.nachtdienst-grid { background-image: linear-gradient(rgba(145,70,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,122,47,.07) 1px, transparent 1px); background-size: 17px 17px; animation: nachtdienst-scan 8s linear infinite; }
				`}</style>
			</section>
		</div>
	);
}

function LastGameScene({ game, queue }: { game: LauchgruenObsResponse["lastGames"][number]; queue: string }) {
	const minutes = Math.floor(game.durationSeconds / 60);
	const seconds = game.durationSeconds % 60;
	const resultTone = game.win ? "text-[#ffd84d]" : "text-[#ff7a2f]";
	const resultBorder = game.win ? "border-[#ffd84d]/85" : "border-[#ff7a2f]/90";

	return (
		<div className="nachtdienst-scene relative grid h-full grid-cols-[112px_1fr] gap-4 px-4 py-3">
			<div className="flex items-center justify-center border-r border-[#b784ff]/20 pr-4">
				<div className={`relative size-[94px] overflow-hidden border-2 ${resultBorder} bg-[#140a20] shadow-[0_0_24px_rgba(145,70,255,.48)]`}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
					<div className={`absolute inset-x-0 bottom-0 bg-black/78 py-1 text-center text-[9px] font-black uppercase tracking-[0.24em] ${resultTone}`}>
						{game.win ? "Victory" : "Defeat"}
					</div>
				</div>
			</div>

			<div className="min-w-0 py-0.5">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="text-[8px] font-black uppercase tracking-[0.28em] text-[#c9a7ff]">After Shift Report // Letztes Ranked</div>
						<div className="mt-1 truncate text-[22px] font-black leading-none tracking-[-0.03em]">{game.championName}</div>
					</div>
					<div className="shrink-0 text-right text-[8px] font-black uppercase tracking-[0.2em] text-[#ff9b61]">{queue}</div>
				</div>

				<div className="mt-3 grid grid-cols-4 border-y border-white/8 bg-black/20 py-1.5">
					<LastGameMetric label="KDA" value={game.kda} />
					<LastGameMetric label="CS" value={String(game.creepScore)} />
					<LastGameMetric label="Gold" value={`${(game.goldEarned / 1000).toFixed(1)}k`} />
					<LastGameMetric label="Dauer" value={`${minutes}:${String(seconds).padStart(2, "0")}`} />
				</div>

				<div className="mt-2 flex items-center gap-1.5">
					<div className="mr-1 w-12 text-[7px] font-black uppercase leading-tight tracking-[0.18em] text-[#c9a7ff]/70">
						Final
						<br />
						loadout
					</div>
					{game.items.slice(0, 6).map((item, index) => (
						<div key={`${item.id}-${index}`} className="size-[34px] overflow-hidden border border-white/18 bg-black/35 shadow-[0_4px_10px_rgba(0,0,0,.45)]">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function LastGameMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l border-white/8 px-2 first:border-l-0 first:pl-0">
			<div className="text-[7px] font-black uppercase tracking-[0.18em] text-white/35">{label}</div>
			<div className="mt-0.5 truncate font-mono text-[13px] font-black text-white">{value}</div>
		</div>
	);
}

function Metric({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
	return (
		<div className="min-w-14 border-l border-white/8 pl-3 text-right">
			<div className="text-[7px] font-black uppercase tracking-[0.18em] text-white/35">{label}</div>
			<div className={`mt-0.5 font-mono text-[14px] font-black ${tone}`}>{value}</div>
		</div>
	);
}

function rankLabel(rank: LauchgruenObsResponse["rank"]) {
	if (!rank) return "Unranked";
	const tiers: Record<string, string> = {
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
	const tier = tiers[rank.tier.toUpperCase()] ?? rank.tier;
	return [tier, rank.rank].filter(Boolean).join(" ");
}
