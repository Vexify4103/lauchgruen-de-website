"use client";

import { useEffect, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";

type Game = LauchgruenObsResponse["lastGames"][number];

// Base Akali palette: jade outfit, crimson eyes, twilight shroud purple.
const JADE = "#3ee6a8";
const CRIMSON = "#ff3355";
const SHROUD = "#a66bff";

export function XzairenOverlay({ data }: { data: LauchgruenObsResponse }) {
	const gameName = data.riotId.split("#")[0]?.trim() || "Zairen";
	const queueLabel = data.rank?.queueType === "RANKED_FLEX_SR" ? "Flex Queue" : "Solo Queue";
	const games = data.lastGames.slice(0, 5);
	const flow = flowState(games);
	const rankFrameUrl = rankFrame(data.rank?.tier);
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
			<section className="xz-hud relative h-[214px] w-[660px] overflow-visible [text-shadow:0_1px_2px_#000,0_2px_7px_#000,0_0_14px_rgba(0,0,0,.96)]">
				<div
					aria-hidden
					className="xz-shroud absolute -left-6 top-2 h-[200px] w-[420px] rounded-full bg-[radial-gradient(ellipse_at_30%_50%,rgba(166,107,255,.32),rgba(62,230,168,.12)_45%,transparent_72%)] blur-2xl"
				/>
				<div
					aria-hidden
					className="absolute left-[168px] top-[30px] h-[154px] w-px bg-gradient-to-b from-transparent via-[#3ee6a8]/90 to-transparent shadow-[0_0_8px_#3ee6a8]"
				/>
				<div aria-hidden className="xz-slash absolute left-[186px] right-3 top-[99px] h-px bg-gradient-to-r from-[#3ee6a8] via-[#a66bff]/55 to-transparent" />

				<Portrait gameName={gameName} profileIconUrl={data.profileIconUrl} rankFrameUrl={rankFrameUrl} />

				<div key={showLastGameScene ? `last-${lastGame?.matchId}` : "session"} className="xz-scene absolute inset-y-0 left-[190px] right-0 flex flex-col justify-center">
					{showLastGameScene && lastGame ? (
						<LastGameScene game={lastGame} />
					) : (
						<SessionScene data={data} gameName={gameName} queueLabel={queueLabel} games={games} flow={flow} />
					)}
				</div>

				<style>{`
					@keyframes xz-hud-enter {
						0% { opacity: 0; transform: translateX(-26px); filter: blur(8px); }
						60% { opacity: 1; filter: blur(0); }
						100% { opacity: 1; transform: translateX(0); }
					}
					@keyframes xz-slash {
						0%, 100% { opacity: .3; transform: scaleX(.18); transform-origin: left; }
						45% { opacity: .95; transform: scaleX(1); transform-origin: left; }
					}
					@keyframes xz-shroud {
						0%, 100% { opacity: .55; transform: translateX(0) scale(.96); }
						50% { opacity: .95; transform: translateX(14px) scale(1.06); }
					}
					@keyframes xz-aura {
						0%, 100% { opacity: .45; transform: scale(.92); }
						50% { opacity: .9; transform: scale(1.08); }
					}
					@keyframes xz-rank-alive {
						0%, 100% { filter: brightness(.96) saturate(1.05) drop-shadow(0 0 7px rgba(62,230,168,.65)); }
						50% { filter: brightness(1.12) saturate(1.2) drop-shadow(0 0 14px rgba(166,107,255,.85)); }
					}
					@keyframes xz-spin { to { transform: rotate(360deg); } }
					@keyframes xz-eye {
						0%, 82%, 100% { opacity: .9; transform: scaleX(1); }
						86% { opacity: .2; transform: scaleX(.15); }
						90% { opacity: 1; transform: scaleX(1.25); }
					}
					@keyframes xz-game-in {
						from { opacity: 0; transform: translateY(8px) rotate(-6deg) scale(.88); }
						to { opacity: 1; transform: translateY(0) rotate(0) scale(1); }
					}
					@keyframes xz-scene-in {
						0% { opacity: 0; transform: translateX(22px) skewX(-8deg); filter: blur(6px); }
						100% { opacity: 1; transform: translateX(0) skewX(0); filter: blur(0); }
					}
					.xz-hud { animation: xz-hud-enter 760ms cubic-bezier(.16,.84,.2,1) both; }
					.xz-scene { animation: xz-scene-in 720ms cubic-bezier(.16,.84,.2,1) both; }
					.xz-slash { animation: xz-slash 4.8s ease-in-out infinite; }
					.xz-shroud { animation: xz-shroud 7.5s ease-in-out infinite; }
					.xz-aura { animation: xz-aura 3.8s ease-in-out infinite; }
					.xz-rank-frame { animation: xz-rank-alive 5.2s ease-in-out infinite; }
					.xz-spin { animation: xz-spin 14s linear infinite; }
					.xz-spin-rev { animation: xz-spin 22s linear infinite reverse; }
					.xz-eye { animation: xz-eye 6s ease-in-out infinite; transform-origin: center; }
					.xz-game { animation: xz-game-in 560ms cubic-bezier(.16,.84,.2,1) both; }
					.xz-game:nth-child(2) { animation-delay: 70ms; }
					.xz-game:nth-child(3) { animation-delay: 140ms; }
					.xz-game:nth-child(4) { animation-delay: 210ms; }
					.xz-game:nth-child(5) { animation-delay: 280ms; }
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
}: {
	data: LauchgruenObsResponse;
	gameName: string;
	queueLabel: string;
	games: Game[];
	flow: ReturnType<typeof flowState>;
}) {
	const lpDelta = data.lpDelta;
	const avgCs = averageCsPerMinute(games);

	return (
		<>
			<div className="flex items-end justify-between gap-6">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7ff3c6]">
						<EyeSlash />
						Rogue Assassin · {queueLabel}
					</div>
					<div className="mt-1 truncate text-[30px] font-black leading-none tracking-[-0.045em]">{gameName}</div>
					<div className="mt-1.5 flex items-baseline gap-2.5 font-mono font-black">
						<span className="text-[21px] text-[#7ff3c6]">{rankLabel(data.rank)}</span>
						<span className="text-[15px] text-white">{data.rank?.leaguePoints ?? 0} LP</span>
					</div>
				</div>

				<div className="shrink-0 pb-1 text-right">
					<div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#c9a6ff]">Session</div>
					<div className={`mt-1 font-mono text-[25px] font-black leading-none ${lpDelta > 0 ? "text-[#3ee6a8]" : lpDelta < 0 ? "text-[#ff5c77]" : "text-white"}`}>
						{lpDelta > 0 ? "+" : ""}
						{lpDelta} LP
					</div>
					<div className="mt-1 font-mono text-[13px] font-black text-white">
						{data.sessionWins}W <span className="text-white/65">/</span> {data.sessionLosses}L
					</div>
				</div>
			</div>

			<div className="mt-4 grid grid-cols-[1fr_150px] items-end gap-5">
				<div>
					<div className="mb-2 flex items-center justify-between">
						<span className="text-[11px] font-black uppercase tracking-[0.14em] text-white">Letzte Spiele</span>
						<span className="font-mono text-[12px] font-black text-[#7ff3c6]">{games.length ? `${data.winRate}% WR` : "Keine Daten"}</span>
					</div>
					<div className="flex gap-2">
						{[0, 1, 2, 3, 4].map((index) => {
							const game = games[index];
							return game ? (
								<GameResult key={game.matchId} game={game} />
							) : (
								<div key={index} className="flex flex-col items-center gap-1">
									<div className="size-[48px] rounded-[10px] border border-white/30 bg-black/20 shadow-[0_4px_12px_rgba(0,0,0,.55)]" />
									<div className="h-[13px]" />
								</div>
							);
						})}
					</div>
				</div>

				<div className="pb-0.5">
					<div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#c9a6ff]">Ø CS / Min</div>
					<div className={`mt-0.5 font-mono text-[27px] font-black leading-none ${avgCs === null ? "text-white/60" : csTone(avgCs)}`}>
						{avgCs === null ? "–" : avgCs.toFixed(1)}
					</div>
					<div className={`mt-2 truncate text-[13px] font-black uppercase tracking-[0.035em] ${flow.tone}`}>{flow.label}</div>
					<div className="mt-1.5 flex gap-1">
						{[0, 1, 2, 3, 4].map((index) => {
							const game = games[index];
							return (
								<span
									key={index}
									className={`h-1.5 w-[19px] skew-x-[-20deg] ${
										game ? (game.win ? "bg-[#3ee6a8] shadow-[0_0_9px_#3ee6a8]" : "bg-[#ff3355]/80 shadow-[0_0_6px_rgba(255,51,85,.6)]") : "bg-white/20"
									}`}
								/>
							);
						})}
					</div>
				</div>
			</div>
		</>
	);
}

function LastGameScene({ game }: { game: Game }) {
	const minutes = Math.floor(game.durationSeconds / 60);
	const seconds = String(game.durationSeconds % 60).padStart(2, "0");
	const cs = csPerMinute(game);

	return (
		<>
			<div className="flex items-end justify-between gap-5">
				<div>
					<div className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] ${game.win ? "text-[#7ff3c6]" : "text-[#ff7088]"}`}>
						<EyeSlash />
						Letztes Spiel · {game.win ? "Sieg" : "Niederlage"}
					</div>
					<div className="mt-1 text-[30px] font-black leading-none tracking-[-0.04em]">{game.championName}</div>
				</div>
				<div className={`font-mono text-[19px] font-black ${game.win ? "text-[#3ee6a8]" : "text-[#ff5c77]"}`}>{game.win ? "VICTORY" : "DEFEAT"}</div>
			</div>

			<div className="mt-5 grid grid-cols-[82px_1fr] items-center gap-4">
				<div
					className={`relative size-[82px] overflow-hidden rounded-2xl border-[3px] shadow-[0_7px_20px_rgba(0,0,0,.75)] ${
						game.win ? "border-[#3ee6a8] shadow-[0_0_18px_rgba(62,230,168,.7)]" : "border-[#ff3355]/85 shadow-[0_0_14px_rgba(255,51,85,.55)] grayscale-[.4]"
					}`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
				</div>

				<div className="min-w-0">
					<div className="grid grid-cols-[1fr_1.2fr_1fr_1fr] gap-3 font-mono">
						<LastGameMetric label="KDA" value={game.kda} />
						<LastGameMetric
							label="CS / Min"
							value={cs === null ? String(game.creepScore) : `${cs.toFixed(1)}`}
							sub={`${game.creepScore} CS`}
							tone={cs === null ? undefined : csTone(cs)}
						/>
						<LastGameMetric label="Gold" value={`${(game.goldEarned / 1000).toFixed(1)}k`} />
						<LastGameMetric label="Zeit" value={`${minutes}:${seconds}`} />
					</div>
					<div className="mt-2.5 flex min-h-9 gap-1.5">
						{game.items.map((item, index) => (
							<div
								key={`${item.id}-${index}`}
								className="size-9 overflow-hidden rounded-lg border border-[#c9a6ff]/55 bg-black/35 shadow-[0_4px_10px_rgba(0,0,0,.72)]"
							>
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

function LastGameMetric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
	return (
		<div>
			<div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#c9a6ff]">{label}</div>
			<div className={`mt-0.5 text-[16px] font-black ${tone ?? "text-white"}`}>
				{value}
				{sub ? <span className="ml-1.5 text-[10px] text-white/70">{sub}</span> : null}
			</div>
		</div>
	);
}

function Portrait({ gameName, profileIconUrl, rankFrameUrl }: { gameName: string; profileIconUrl: string | null; rankFrameUrl: string | null }) {
	return (
		<div className="absolute left-0 top-1/2 size-[156px] -translate-y-1/2">
			<div
				aria-hidden
				className="xz-aura absolute inset-[12px] rounded-full bg-[radial-gradient(circle,rgba(62,230,168,.45),rgba(166,107,255,.35)_60%,transparent)] blur-2xl"
			/>
			<KamaRing />
			<div className="absolute inset-[31px] z-10 overflow-hidden rounded-full border border-[#bff8e3]/90 bg-[#03100c] shadow-[0_0_12px_#3ee6a8,0_0_34px_rgba(166,107,255,.5),inset_0_0_18px_rgba(0,0,0,.9)]">
				{profileIconUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={profileIconUrl} alt={`Profilicon von ${gameName}`} className="size-full object-cover" />
				) : (
					<div className="grid size-full place-items-center bg-[radial-gradient(circle_at_35%_25%,#bff8e3,#2bb884_42%,#03100c_76%)] text-4xl font-black text-black/80">
						{gameName.charAt(0)}
					</div>
				)}
				<div aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.18),transparent_38%,rgba(40,10,70,.4))]" />
			</div>
			{rankFrameUrl ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					aria-hidden
					src={rankFrameUrl}
					alt=""
					className="xz-rank-frame absolute left-1/2 top-1/2 z-20 h-auto w-[236px] max-w-none -translate-x-1/2 -translate-y-[60%] object-contain"
				/>
			) : null}
		</div>
	);
}

/** Two counter-rotating rings with kunai marks, like Akali's spinning kamas. */
function KamaRing() {
	return (
		<>
			<svg aria-hidden viewBox="0 0 100 100" className="xz-spin absolute inset-[16px] z-[5] overflow-visible">
				<circle cx="50" cy="50" r="47" fill="none" stroke={JADE} strokeOpacity=".55" strokeWidth=".8" strokeDasharray="22 7" />
				{[0, 120, 240].map((angle) => (
					<path key={angle} d="M50 0 L53 6 L50 4.6 L47 6 Z" fill={JADE} transform={`rotate(${angle} 50 50)`} style={{ filter: `drop-shadow(0 0 2px ${JADE})` }} />
				))}
			</svg>
			<svg aria-hidden viewBox="0 0 100 100" className="xz-spin-rev absolute inset-[8px] z-[5] overflow-visible">
				<circle cx="50" cy="50" r="49" fill="none" stroke={SHROUD} strokeOpacity=".5" strokeWidth=".6" strokeDasharray="3 9" />
				{[60, 300].map((angle) => (
					<circle key={angle} cx="50" cy="1" r="1.4" fill={CRIMSON} transform={`rotate(${angle} 50 50)`} style={{ filter: `drop-shadow(0 0 3px ${CRIMSON})` }} />
				))}
			</svg>
		</>
	);
}

/** Akali's mask slit with the glowing red eye. */
function EyeSlash() {
	return (
		<span aria-hidden className="relative inline-flex h-2 w-7 items-center">
			<span className="h-px w-full bg-gradient-to-r from-transparent via-[#3ee6a8] to-[#3ee6a8] shadow-[0_0_6px_#3ee6a8]" />
			<span className="xz-eye absolute right-0 h-[4px] w-[9px] rounded-full bg-[#ff3355] shadow-[0_0_6px_#ff3355,0_0_12px_rgba(255,51,85,.8)]" />
		</span>
	);
}

function GameResult({ game }: { game: Game }) {
	const cs = csPerMinute(game);
	return (
		<div className="xz-game flex flex-col items-center gap-1">
			<div
				className={`relative size-[48px] overflow-hidden rounded-[10px] border-[3px] bg-black/40 shadow-[0_5px_14px_rgba(0,0,0,.72)] ${
					game.win ? "border-[#3ee6a8] shadow-[0_0_14px_rgba(62,230,168,.6),0_5px_14px_rgba(0,0,0,.72)]" : "border-[#ff3355]/80 grayscale-[.65]"
				}`}
			>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
				{game.win ? (
					<div className="absolute bottom-0 right-0 rounded-tl bg-[#3ee6a8] px-1 py-0.5 text-[9px] font-black text-[#02130c]">W</div>
				) : (
					<>
						<div
							aria-hidden
							className="absolute left-1/2 top-1/2 h-[3px] w-[64px] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] bg-[#ff3355]/90 shadow-[0_0_5px_black]"
						/>
						<div className="absolute bottom-0 right-0 rounded-tl bg-black/90 px-1 py-0.5 text-[9px] font-black text-[#ff7088]">L</div>
					</>
				)}
			</div>
			<div className={`font-mono text-[10px] font-black leading-[13px] ${cs === null ? "text-white/50" : csTone(cs)}`}>{cs === null ? "–" : cs.toFixed(1)}</div>
		</div>
	);
}

export function csPerMinute(game: Pick<Game, "creepScore" | "durationSeconds">): number | null {
	if (!game.durationSeconds || game.durationSeconds < 60) return null;
	return game.creepScore / (game.durationSeconds / 60);
}

/** Total CS over total minutes, so long games weigh more than remakes. */
export function averageCsPerMinute(games: Array<Pick<Game, "creepScore" | "durationSeconds">>): number | null {
	const counted = games.filter((game) => game.durationSeconds >= 300);
	const seconds = counted.reduce((sum, game) => sum + game.durationSeconds, 0);
	if (!seconds) return null;
	return counted.reduce((sum, game) => sum + game.creepScore, 0) / (seconds / 60);
}

function csTone(value: number) {
	if (value >= 8) return "text-[#3ee6a8]";
	if (value >= 6.5) return "text-[#c9a6ff]";
	return "text-[#ff7088]";
}

function flowState(games: Game[]) {
	if (!games.length) return { label: "Im Schatten", tone: "text-white" };
	const newestResult = games[0].win;
	let streak = 0;
	for (const game of games) {
		if (game.win !== newestResult) break;
		streak += 1;
	}
	if (newestResult && streak >= 2) return { label: `Execution ×${streak}`, tone: "text-[#3ee6a8]" };
	if (!newestResult && streak >= 2) return { label: `Shroud ×${streak}`, tone: "text-[#c9a6ff]" };
	const momentum = games.reduce((score, game) => score + (game.win ? 1 : -1), 0);
	if (momentum > 0) return { label: `Shuriken Flip +${momentum}`, tone: "text-[#3ee6a8]" };
	if (momentum < 0) return { label: `Shuriken Flip ${momentum}`, tone: "text-[#ff7088]" };
	return { label: "Balance", tone: "text-white" };
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
