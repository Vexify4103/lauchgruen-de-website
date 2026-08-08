"use client";

import { useEffect, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";

export function AkumaOverlay({ data }: { data: LauchgruenObsResponse }) {
	const gameName = data.riotId.split("#")[0]?.trim() || "Aoi Akuma";
	const queueLabel = data.rank?.queueType === "RANKED_FLEX_SR" ? "Flex Queue" : "Solo Queue";
	const games = data.lastGames.slice(0, 5);
	const flow = flowState(games);
	const rankFrameUrl = rankFrame(data.rank?.tier);
	const lpDelta = data.lpDelta;
	const [showLastGame, setShowLastGame] = useState(false);
	const lastGame = games[0];
	const hasLastGame = Boolean(lastGame);
	const showLastGameScene = Boolean(lastGame && showLastGame);

	useEffect(() => {
		if (!hasLastGame) return;
		const interval = window.setInterval(() => setShowLastGame((current) => !current), 30_000);
		return () => window.clearInterval(interval);
	}, [hasLastGame]);

	return (
		<div className="pointer-events-none min-h-screen overflow-hidden bg-transparent p-4 text-white">
			<section className="akuma-hud relative h-[202px] w-[640px] overflow-visible [text-shadow:0_1px_2px_#000,0_2px_7px_#000,0_0_14px_rgba(0,0,0,.96)]">
				<div
					aria-hidden
					className="absolute left-[164px] top-[27px] h-[150px] w-px bg-gradient-to-b from-transparent via-[#8eeaff]/90 to-transparent shadow-[0_0_8px_#8eeaff]"
				/>
				<div aria-hidden className="akuma-signal absolute left-[181px] right-3 top-[93px] h-px bg-gradient-to-r from-[#8eeaff] via-[#8eeaff]/35 to-transparent" />

				<RankPortrait gameName={gameName} profileIconUrl={data.profileIconUrl} rankFrameUrl={rankFrameUrl} />

				<div key={showLastGameScene ? `last-${lastGame?.matchId}` : "session"} className="akuma-scene absolute inset-y-0 left-[184px] right-0 flex flex-col justify-center">
					{showLastGameScene && lastGame ? (
						<LastGameScene game={lastGame} />
					) : (
						<SessionScene data={data} gameName={gameName} queueLabel={queueLabel} games={games} flow={flow} lpDelta={lpDelta} />
					)}
				</div>

				<style>{`
					@keyframes akuma-hud-enter {
						from { opacity: 0; transform: translateX(-22px); filter: blur(7px); }
						to { opacity: 1; transform: translateX(0); filter: blur(0); }
					}
					@keyframes akuma-signal {
						0%, 100% { opacity: .28; transform: scaleX(.22); transform-origin: left; }
						50% { opacity: .9; transform: scaleX(1); transform-origin: left; }
					}
					@keyframes akuma-aura {
						0%, 100% { opacity: .5; transform: scale(.92); }
						50% { opacity: .92; transform: scale(1.08); }
					}
					@keyframes akuma-rank-alive {
						0%, 100% { filter: brightness(.96) saturate(1.05) drop-shadow(0 0 7px rgba(142,234,255,.7)); }
						50% { filter: brightness(1.12) saturate(1.2) drop-shadow(0 0 14px rgba(142,234,255,.95)); }
					}
					@keyframes akuma-orbit { to { transform: rotate(360deg); } }
					@keyframes akuma-game-in {
						from { opacity: 0; transform: translateY(7px) scale(.92); }
						to { opacity: 1; transform: translateY(0) scale(1); }
					}
					@keyframes akuma-scene-in {
						from { opacity: 0; transform: translateX(20px); filter: blur(6px); }
						to { opacity: 1; transform: translateX(0); filter: blur(0); }
					}
					.akuma-hud { animation: akuma-hud-enter 700ms cubic-bezier(.16,.84,.2,1) both; }
					.akuma-scene { animation: akuma-scene-in 720ms cubic-bezier(.16,.84,.2,1) both; }
					.akuma-signal { animation: akuma-signal 5.6s ease-in-out infinite; }
					.akuma-profile-aura { animation: akuma-aura 3.8s ease-in-out infinite; }
					.akuma-rank-frame { animation: akuma-rank-alive 5.2s ease-in-out infinite; }
					.akuma-orbit { animation: akuma-orbit 18s linear infinite; }
					.akuma-game { animation: akuma-game-in 560ms cubic-bezier(.16,.84,.2,1) both; }
					.akuma-game:nth-child(2) { animation-delay: 70ms; }
					.akuma-game:nth-child(3) { animation-delay: 140ms; }
					.akuma-game:nth-child(4) { animation-delay: 210ms; }
					.akuma-game:nth-child(5) { animation-delay: 280ms; }
				`}</style>
			</section>
		</div>
	);
}

function SessionScene({
	data,
	gameName,
	queueLabel,
	games,
	flow,
	lpDelta,
}: {
	data: LauchgruenObsResponse;
	gameName: string;
	queueLabel: string;
	games: LauchgruenObsResponse["lastGames"];
	flow: ReturnType<typeof flowState>;
	lpDelta: number;
}) {
	return (
		<>
			<div className="flex items-end justify-between gap-6">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#9defff]">
						<span className="inline-block h-px w-6 bg-[#8eeaff] shadow-[0_0_7px_#8eeaff]" />
						Blue Demon · {queueLabel}
					</div>
					<div className="mt-1 truncate text-[30px] font-black leading-none tracking-[-0.045em]">{gameName}</div>
					<div className="mt-1.5 flex items-baseline gap-2.5 font-mono font-black">
						<span className="text-[21px] text-[#9defff]">{rankLabel(data.rank)}</span>
						<span className="text-[15px] text-white">{data.rank?.leaguePoints ?? 0} LP</span>
					</div>
				</div>

				<div className="shrink-0 pb-1 text-right">
					<div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9defff]">Session</div>
					<div className={`mt-1 font-mono text-[25px] font-black leading-none ${lpDelta > 0 ? "text-[#8eeaff]" : "text-white"}`}>
						{lpDelta > 0 ? "+" : ""}
						{lpDelta} LP
					</div>
					<div className="mt-1 font-mono text-[13px] font-black text-white">
						{data.sessionWins}W <span className="text-white/65">/</span> {data.sessionLosses}L
					</div>
				</div>
			</div>

			<div className="mt-5 grid grid-cols-[1fr_150px] items-end gap-5">
				<div>
					<div className="mb-2 flex items-center justify-between">
						<span className="text-[11px] font-black uppercase tracking-[0.14em] text-white">Letzte Spiele</span>
						<span className="font-mono text-[12px] font-black text-[#9defff]">{games.length ? `${data.winRate}% WR` : "Keine Daten"}</span>
					</div>
					<div className="flex gap-2">
						{[0, 1, 2, 3, 4].map((index) => {
							const game = games[index];
							return game ? (
								<GameResult key={game.matchId} game={game} />
							) : (
								<div key={index} className="size-[48px] rounded-[10px] border border-white/30 bg-black/20 shadow-[0_4px_12px_rgba(0,0,0,.55)]" />
							);
						})}
					</div>
				</div>

				<div className="pb-0.5">
					<div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#9defff]">Demon Pulse</div>
					<div className={`mt-1.5 truncate text-[15px] font-black uppercase tracking-[0.035em] ${flow.tone}`}>{flow.label}</div>
					<div className="mt-2.5 flex gap-1">
						{[0, 1, 2, 3, 4].map((index) => {
							const game = games[index];
							return (
								<span
									key={index}
									className={`h-1.5 w-[19px] skew-x-[-20deg] ${
										game ? (game.win ? "bg-[#8eeaff] shadow-[0_0_9px_#8eeaff]" : "bg-white/45 shadow-[0_2px_5px_#000]") : "bg-white/20"
									}`}
								/>
							);
						})}
					</div>
					<div className="mt-2 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-white">
						{String(data.sessionWins + data.sessionLosses).padStart(2, "0")} Session-Games
					</div>
				</div>
			</div>
		</>
	);
}

function LastGameScene({ game }: { game: LauchgruenObsResponse["lastGames"][number] }) {
	const minutes = Math.floor(game.durationSeconds / 60);
	const seconds = String(game.durationSeconds % 60).padStart(2, "0");

	return (
		<>
			<div className="flex items-end justify-between gap-5">
				<div>
					<div className={`text-[11px] font-black uppercase tracking-[0.16em] ${game.win ? "text-[#8eeaff]" : "text-white"}`}>
						Letztes Spiel · {game.win ? "Sieg" : "Niederlage"}
					</div>
					<div className="mt-1 text-[30px] font-black leading-none tracking-[-0.04em]">{game.championName}</div>
				</div>
				<div className={`font-mono text-[19px] font-black ${game.win ? "text-[#8eeaff]" : "text-white"}`}>{game.win ? "VICTORY" : "DEFEAT"}</div>
			</div>

			<div className="mt-5 grid grid-cols-[82px_1fr] items-center gap-4">
				<div
					className={`relative size-[82px] overflow-hidden rounded-2xl border-[3px] shadow-[0_7px_20px_rgba(0,0,0,.75)] ${game.win ? "border-[#8eeaff] shadow-[0_0_18px_rgba(105,220,255,.72)]" : "border-white/80 grayscale-[.45]"}`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
				</div>

				<div className="min-w-0">
					<div className="grid grid-cols-4 gap-3 font-mono">
						<LastGameMetric label="KDA" value={game.kda} />
						<LastGameMetric label="CS" value={String(game.creepScore)} />
						<LastGameMetric label="Gold" value={`${(game.goldEarned / 1000).toFixed(1)}k`} />
						<LastGameMetric label="Zeit" value={`${minutes}:${seconds}`} />
					</div>
					<div className="mt-3 flex min-h-9 gap-1.5">
						{game.items.map((item, index) => (
							<div key={`${item.id}-${index}`} className="size-9 overflow-hidden rounded-lg border border-white/65 bg-black/35 shadow-[0_4px_10px_rgba(0,0,0,.72)]">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
							</div>
						))}
					</div>
				</div>
			</div>
		</>
	);
}

function LastGameMetric({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#9defff]">{label}</div>
			<div className="mt-0.5 text-[16px] font-black text-white">{value}</div>
		</div>
	);
}

function RankPortrait({ gameName, profileIconUrl, rankFrameUrl }: { gameName: string; profileIconUrl: string | null; rankFrameUrl: string | null }) {
	return (
		<div className="absolute left-0 top-1/2 size-[150px] -translate-y-1/2">
			<div aria-hidden className="akuma-profile-aura absolute inset-[12px] rounded-full bg-[#7de8ff]/35 blur-2xl" />
			<div className="absolute inset-[29px] z-10 overflow-hidden rounded-full border border-[#d9f9ff]/90 bg-[#02090e] shadow-[0_0_12px_#8eeaff,0_0_34px_rgba(89,211,255,.58),inset_0_0_18px_rgba(0,0,0,.9)]">
				{profileIconUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={profileIconUrl} alt={`Profilicon von ${gameName}`} className="size-full object-cover" />
				) : (
					<div className="grid size-full place-items-center bg-[radial-gradient(circle_at_35%_25%,#b9f5ff,#4dbfe5_42%,#02090e_76%)] text-4xl font-black text-black/80">
						{gameName.charAt(0)}
					</div>
				)}
				<div aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.2),transparent_38%,rgba(0,0,0,.34))]" />
			</div>
			{rankFrameUrl ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					aria-hidden
					src={rankFrameUrl}
					alt=""
					className="akuma-rank-frame absolute left-1/2 top-1/2 z-20 h-auto w-[230px] max-w-none -translate-x-1/2 -translate-y-[60%] object-contain"
				/>
			) : (
				<div aria-hidden className="akuma-orbit absolute inset-[15px] z-20 rounded-full border border-dashed border-[#b9f5ff]/75" />
			)}
		</div>
	);
}

function GameResult({ game }: { game: LauchgruenObsResponse["lastGames"][number] }) {
	return (
		<div
			className={`akuma-game relative size-[48px] overflow-hidden rounded-[10px] border-[3px] bg-black/40 shadow-[0_5px_14px_rgba(0,0,0,.72)] ${
				game.win ? "border-[#8eeaff] shadow-[0_0_14px_rgba(105,220,255,.68),0_5px_14px_rgba(0,0,0,.72)]" : "border-white/75 grayscale-[.72]"
			}`}
		>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
			{game.win ? (
				<div className="absolute bottom-0 right-0 rounded-tl bg-[#8eeaff] px-1 py-0.5 text-[9px] font-black text-[#031018]">W</div>
			) : (
				<>
					<div aria-hidden className="absolute left-1/2 top-1/2 h-[3px] w-[64px] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] bg-white/90 shadow-[0_0_5px_black]" />
					<div className="absolute bottom-0 right-0 rounded-tl bg-black/90 px-1 py-0.5 text-[9px] font-black text-white">L</div>
				</>
			)}
		</div>
	);
}

function flowState(games: LauchgruenObsResponse["lastGames"]) {
	if (!games.length) return { label: "Dormant", tone: "text-white" };
	const newestResult = games[0].win;
	let streak = 0;
	for (const game of games) {
		if (game.win !== newestResult) break;
		streak += 1;
	}
	if (newestResult && streak >= 2) return { label: `Blue Flame ×${streak}`, tone: "text-[#8eeaff]" };
	if (!newestResult && streak >= 2) return { label: `Shadow Phase ×${streak}`, tone: "text-white" };
	const momentum = games.reduce((score, game) => score + (game.win ? 1 : -1), 0);
	if (momentum > 0) return { label: `Soul Current +${momentum}`, tone: "text-[#8eeaff]" };
	if (momentum < 0) return { label: `Soul Current ${momentum}`, tone: "text-white" };
	return { label: "Balanced Soul", tone: "text-white" };
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
	return [tiers[rank.tier.toUpperCase()] ?? rank.tier, rank.rank].filter(Boolean).join(" ");
}

function rankFrame(tier?: string | null) {
	const frames: Record<string, string> = {
		IRON: "/overlay/Iron.png",
		BRONZE: "/overlay/Bronze.png",
		SILVER: "/overlay/Silver.png",
		GOLD: "/overlay/Gold.png",
		PLATINUM: "/overlay/Platinum.png",
		EMERALD: "/overlay/Emerald.png",
		DIAMOND: "/overlay/Diamond.png",
		MASTER: "/overlay/Master.png",
		GRANDMASTER: "/overlay/Grand.png",
		CHALLENGER: "/overlay/Challenger.png",
	};
	return tier ? (frames[tier.toUpperCase()] ?? null) : null;
}
