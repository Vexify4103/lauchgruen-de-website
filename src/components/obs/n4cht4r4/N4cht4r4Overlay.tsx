"use client";

import { useEffect, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";

export function N4cht4r4Overlay({ data }: { data: LauchgruenObsResponse }) {
	const gameName = data.riotId.split("#")[0]?.trim() || "N4cht4r4";
	const games = data.lastGames.slice(0, 5);
	const rankFrameUrl = rankFrame(data.rank?.tier);
	const lpDelta = data.lpDelta;
	const queueLabel = data.rank?.queueType === "RANKED_FLEX_SR" ? "Flex Queue" : "Solo Queue";
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
		<div className="pointer-events-none min-h-screen overflow-hidden bg-transparent text-white">
			<section className="sakura-hud absolute bottom-[18px] left-[28px] h-[176px] w-[448px] overflow-visible [text-shadow:0_2px_3px_rgba(27,5,18,.98),0_0_10px_rgba(20,3,13,.92)]">
				<div
					aria-hidden
					className="absolute bottom-[9px] left-[130px] right-0 h-[102px] rounded-[26px] bg-[linear-gradient(105deg,rgba(42,8,27,.48),rgba(84,20,51,.25)_58%,transparent)] blur-[1px] [clip-path:polygon(0_10%,95%_0,100%_75%,92%_100%,0_92%)]"
				/>
				<div
					aria-hidden
					className="absolute bottom-[17px] left-[126px] right-[8px] h-px bg-gradient-to-r from-[#ffb8d6] via-[#ff73ad]/80 to-transparent shadow-[0_0_10px_#ff7db5]"
				/>
				<div aria-hidden className="sakura-branch absolute bottom-[6px] left-[102px] h-[62px] w-[330px] rounded-[50%] border-b-2 border-[#b74d7b]/70" />

				<Petals />
				<RankPortrait gameName={gameName} profileIconUrl={data.profileIconUrl} rankFrameUrl={rankFrameUrl} />

				<div key={showLastGameScene ? `last-${lastGame?.matchId}` : "session"} className="sakura-scene absolute bottom-[24px] left-[148px] right-0 min-h-[122px]">
					{showLastGameScene && lastGame ? (
						<LastGameScene game={lastGame} />
					) : (
						<>
							<div className="flex items-end justify-between gap-4">
								<div className="min-w-0">
									<div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#ffd4e6]">
										<span className="inline-block h-px w-5 bg-[#ff8fbe] shadow-[0_0_8px_#ff73ad]" />
										{queueLabel}
									</div>
									<div className="mt-1 truncate text-[25px] font-black leading-none tracking-[-0.04em] text-white">{gameName}</div>
									<div className="mt-1 flex items-baseline gap-2 font-mono font-black">
										<span className="text-[15px] text-[#ffc1dc]">{rankLabel(data.rank)}</span>
										<span className="text-[12px] text-white">{data.rank?.leaguePoints ?? 0} LP</span>
									</div>
								</div>

								<div className="shrink-0 pr-2 text-right">
									<div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#ffd4e6]">Session LP</div>
									<div
										className={`font-mono text-[24px] font-black leading-none ${lpDelta > 0 ? "text-[#a8f5cf]" : lpDelta < 0 ? "text-[#ff779e]" : "text-white"}`}
									>
										{lpDelta > 0 ? "+" : ""}
										{lpDelta}
									</div>
								</div>
							</div>

							<div className="mt-3 flex items-center justify-between gap-3">
								<div className="flex gap-2">
									{[0, 1, 2, 3, 4].map((index) => {
										const game = games[index];
										return game ? <GameResult key={game.matchId} game={game} index={index} /> : <EmptyGame key={index} />;
									})}
								</div>
								<div className="pr-2 text-right font-mono text-[11px] font-black text-white">
									{data.sessionWins}W <span className="text-white/50">/</span> {data.sessionLosses}L
								</div>
							</div>
						</>
					)}
				</div>

				<style>{`
					@keyframes sakura-enter {
						from { opacity: 0; transform: translateX(-24px); filter: blur(7px); }
						to { opacity: 1; transform: translateX(0); filter: blur(0); }
					}
					@keyframes sakura-aura {
						0%, 100% { opacity: .45; transform: scale(.93); }
						50% { opacity: .82; transform: scale(1.08); }
					}
					@keyframes sakura-frame {
						0%, 100% { filter: brightness(.98) saturate(1.04) drop-shadow(0 0 7px rgba(255,130,181,.62)); }
						50% { filter: brightness(1.12) saturate(1.18) drop-shadow(0 0 14px rgba(255,126,181,.9)); }
					}
					@keyframes sakura-petal {
						0% { opacity: 0; transform: translate3d(0,-12px,0) rotate(0deg); }
						16% { opacity: .9; }
						100% { opacity: 0; transform: translate3d(34px,72px,0) rotate(250deg); }
					}
					@keyframes sakura-game {
						from { opacity: 0; transform: translateY(8px) scale(.9); }
						to { opacity: 1; transform: translateY(0) scale(1); }
					}
					@keyframes sakura-scene {
						from { opacity: 0; transform: translateX(18px); filter: blur(5px); }
						to { opacity: 1; transform: translateX(0); filter: blur(0); }
					}
					.sakura-hud { animation: sakura-enter 720ms cubic-bezier(.16,.84,.2,1) both; filter: drop-shadow(0 10px 20px rgba(24,4,14,.42)); }
					.sakura-profile-aura { animation: sakura-aura 4.4s ease-in-out infinite; }
					.sakura-rank-frame { animation: sakura-frame 5.8s ease-in-out infinite; }
					.sakura-petal { animation: sakura-petal 7s ease-in-out infinite; }
					.sakura-petal:nth-child(2) { animation-delay: -1.4s; }
					.sakura-petal:nth-child(3) { animation-delay: -3.1s; }
					.sakura-petal:nth-child(4) { animation-delay: -4.8s; }
					.sakura-petal:nth-child(5) { animation-delay: -6.2s; }
					.sakura-game { animation: sakura-game 520ms cubic-bezier(.16,.84,.2,1) both; }
					.sakura-scene { animation: sakura-scene 680ms cubic-bezier(.16,.84,.2,1) both; }
				`}</style>
			</section>
		</div>
	);
}

function LastGameScene({ game }: { game: LauchgruenObsResponse["lastGames"][number] }) {
	const minutes = Math.floor(game.durationSeconds / 60);
	const seconds = String(game.durationSeconds % 60).padStart(2, "0");

	return (
		<div className="pt-1">
			<div className="flex items-end justify-between gap-3 pr-2">
				<div className="min-w-0">
					<div className={`text-[9px] font-black uppercase tracking-[0.2em] ${game.win ? "text-[#a8f5cf]" : "text-[#ff94b2]"}`}>
						Letztes Spiel · {game.win ? "Sieg" : "Niederlage"}
					</div>
					<div className="mt-1 truncate text-[23px] font-black leading-none tracking-[-0.035em] text-white">{game.championName}</div>
				</div>
				<div className={`font-mono text-[16px] font-black ${game.win ? "text-[#a8f5cf]" : "text-[#ff779e]"}`}>{game.win ? "VICTORY" : "DEFEAT"}</div>
			</div>

			<div className="mt-3 grid grid-cols-[58px_1fr] items-center gap-3 pr-2">
				<div
					className={`relative size-[58px] overflow-hidden rounded-[16px] border-[3px] ${game.win ? "border-[#9af0c5] shadow-[0_0_14px_rgba(126,240,188,.56)]" : "border-[#ff759b] shadow-[0_0_14px_rgba(255,89,137,.5)]"}`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
				</div>
				<div className="min-w-0">
					<div className="grid grid-cols-4 gap-2 font-mono">
						<LastGameMetric label="KDA" value={game.kda} />
						<LastGameMetric label="CS" value={String(game.creepScore)} />
						<LastGameMetric label="Gold" value={`${(game.goldEarned / 1000).toFixed(1)}k`} />
						<LastGameMetric label="Zeit" value={`${minutes}:${seconds}`} />
					</div>
					<div className="mt-2 flex min-h-6 gap-1">
						{game.items.map((item, index) => (
							<div
								key={`${item.id}-${index}`}
								className="size-6 overflow-hidden rounded-md border border-[#ffd0e3]/65 bg-[#260817]/45 shadow-[0_3px_8px_rgba(20,3,13,.72)]"
							>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function LastGameMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="text-[8px] font-black uppercase tracking-[0.1em] text-[#ffc5dd]">{label}</div>
			<div className="mt-0.5 truncate text-[11px] font-black text-white">{value}</div>
		</div>
	);
}

function RankPortrait({ gameName, profileIconUrl, rankFrameUrl }: { gameName: string; profileIconUrl: string | null; rankFrameUrl: string | null }) {
	return (
		<div className="absolute bottom-0 left-0 size-[160px]">
			<div aria-hidden className="sakura-profile-aura absolute left-[22px] top-[31px] size-[116px] rounded-full bg-[#ff80b8]/35 blur-2xl" />
			<div className="absolute left-[37px] top-[46px] z-10 size-[86px] overflow-hidden rounded-full border border-[#ffe2ef] bg-[#2b071b] shadow-[0_0_13px_#ff9cc8,0_0_32px_rgba(255,91,157,.55),inset_0_0_14px_rgba(0,0,0,.85)]">
				{profileIconUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={profileIconUrl} alt={`Profilicon von ${gameName}`} className="size-full object-cover" />
				) : (
					<div className="grid size-full place-items-center bg-[radial-gradient(circle_at_35%_25%,#ffe4ef,#f28ab7_45%,#4b0a2e_80%)] text-3xl font-black text-white">
						N
					</div>
				)}
				<div aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.22),transparent_38%,rgba(0,0,0,.3))]" />
			</div>
			{rankFrameUrl ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					aria-hidden
					src={rankFrameUrl}
					alt=""
					className="sakura-rank-frame absolute left-1/2 top-1/2 z-20 h-auto w-[238px] max-w-none -translate-x-1/2 -translate-y-[57%] object-contain"
				/>
			) : (
				<div aria-hidden className="absolute left-[27px] top-[36px] z-20 size-[106px] rounded-full border-2 border-[#ffb9d6]/75 shadow-[0_0_12px_#ff7db5]" />
			)}
		</div>
	);
}

function GameResult({ game, index }: { game: LauchgruenObsResponse["lastGames"][number]; index: number }) {
	return (
		<div
			className={`sakura-game relative size-[43px] overflow-hidden rounded-[13px] border-2 bg-[#250817]/55 shadow-[0_5px_12px_rgba(20,3,13,.8)] ${
				game.win ? "border-[#9af0c5] shadow-[0_0_11px_rgba(126,240,188,.56)]" : "border-[#ff759b] shadow-[0_0_11px_rgba(255,89,137,.48)]"
			}`}
			style={{ animationDelay: `${index * 65}ms` }}
		>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={game.championIconUrl} alt={game.championName} className={`size-full object-cover ${game.win ? "" : "grayscale-[.36]"}`} />
			<div className={`absolute bottom-0 right-0 rounded-tl-md px-1 py-0.5 text-[8px] font-black ${game.win ? "bg-[#9af0c5] text-[#083323]" : "bg-[#ff5e89] text-white"}`}>
				{game.win ? "W" : "L"}
			</div>
		</div>
	);
}

function EmptyGame() {
	return <div className="size-[43px] rounded-[13px] border border-[#ffc5dd]/25 bg-[#3d1028]/25 shadow-[0_4px_12px_rgba(20,3,13,.42)]" />;
}

function Petals() {
	const petals = [
		{ left: 116, top: 11, rotate: -24 },
		{ left: 238, top: 2, rotate: 18 },
		{ left: 355, top: 24, rotate: 42 },
		{ left: 401, top: 58, rotate: -38 },
		{ left: 183, top: 42, rotate: 12 },
	];
	return (
		<div aria-hidden className="absolute inset-0 overflow-visible">
			{petals.map((petal, index) => (
				<span
					key={index}
					className="sakura-petal absolute h-[7px] w-[13px] rounded-[80%_20%_70%_30%] bg-gradient-to-br from-[#ffe7f1] to-[#ff80b5] shadow-[0_0_7px_rgba(255,145,192,.72)]"
					style={{ left: petal.left, top: petal.top, rotate: `${petal.rotate}deg` }}
				/>
			))}
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
