"use client";

import { useEffect, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { averageCsPerMinute, csPerMinute } from "@/components/obs/xzairen/XzairenOverlay";
import { brushScript, serifKr } from "@/components/obs/xzairen/ninja-fonts";

type Game = LauchgruenObsResponse["lastGames"][number];

const JADE = "#3ee6a8";
const CRIMSON = "#ff3355";
const SHROUD = "#a66bff";
const KR = { fontFamily: serifKr.style.fontFamily, fontWeight: 500 };
const KR_STRONG = { fontFamily: serifKr.style.fontFamily, fontWeight: 650 };
const BRUSH = brushScript.style.fontFamily;

export type NinjaLang = "ko" | "en";

const TEXT = {
	ko: {
		solo: "솔로 랭크",
		flex: "자유 랭크",
		session: "세션",
		record: (w: number, l: number) => [`${w}승`, `${l}패`],
		recent: "최근 경기",
		winRate: (wr: number) => `승률 ${wr}%`,
		noGames: "기록 없음",
		csMin: "분당 CS",
		gold: "골드",
		time: "시간",
		victory: "승리",
		defeat: "패배",
		scroll: "그림자 암살자",
		seal: "검",
		execution: "처형",
		shroud: "장막",
		momentum: "기세",
		balance: "균형",
		idle: "그림자 속",
		unranked: "언랭",
		tiers: {
			IRON: "아이언",
			BRONZE: "브론즈",
			SILVER: "실버",
			GOLD: "골드",
			PLATINUM: "플래티넘",
			EMERALD: "에메랄드",
			DIAMOND: "다이아몬드",
			MASTER: "마스터",
			GRANDMASTER: "그랜드마스터",
			CHALLENGER: "챌린저",
		} as Record<string, string>,
	},
	en: {
		solo: "Solo Queue",
		flex: "Flex Queue",
		session: "Session",
		record: (w: number, l: number) => [`${w}W`, `${l}L`],
		recent: "Recent Games",
		winRate: (wr: number) => `${wr}% WR`,
		noGames: "No games",
		csMin: "CS/Min",
		gold: "Gold",
		time: "Time",
		victory: "Victory",
		defeat: "Defeat",
		scroll: "Shadow Assassin",
		seal: "Z",
		execution: "Execution",
		shroud: "Shroud",
		momentum: "Momentum",
		balance: "Balanced",
		idle: "In the Shadows",
		unranked: "Unranked",
		tiers: {
			IRON: "Iron",
			BRONZE: "Bronze",
			SILVER: "Silver",
			GOLD: "Gold",
			PLATINUM: "Platinum",
			EMERALD: "Emerald",
			DIAMOND: "Diamond",
			MASTER: "Master",
			GRANDMASTER: "Grandmaster",
			CHALLENGER: "Challenger",
		} as Record<string, string>,
	},
};

type NinjaText = (typeof TEXT)["en"];

/** Ink-and-blade ninja style with Korean or English labels. Same data as XzairenOverlay. */
export function XzairenNinjaOverlay({ data, lang = "ko" }: { data: LauchgruenObsResponse; lang?: NinjaLang }) {
	const t = TEXT[lang];
	const gameName = data.riotId.split("#")[0]?.trim() || "Zairen";
	const games = data.lastGames.slice(0, 5);
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
			<section className="nj-hud relative h-[232px] w-[720px] overflow-visible [text-shadow:0_1px_2px_#000,0_2px_8px_#000]">
				<Smoke />
				<SideScroll t={t} />
				<DiamondPortrait gameName={gameName} profileIconUrl={data.profileIconUrl} />

				<div className="nj-panel absolute bottom-[10px] left-[188px] right-0 top-[10px]">
					<InkStroke />
					<div key={showLastGameScene ? `last-${lastGame?.matchId}` : "session"} className="nj-scene absolute inset-0 flex flex-col justify-center pb-1 pl-9 pr-6 pt-6">
						{showLastGameScene && lastGame ? <LastGameScene game={lastGame} t={t} /> : <SessionScene data={data} gameName={gameName} games={games} t={t} />}
					</div>
					<div key={`blade-${showLastGameScene}`} aria-hidden className="nj-blade absolute -inset-y-6 left-0 w-[3px] bg-white shadow-[0_0_12px_#fff,0_0_26px_#3ee6a8]" />
				</div>

				<style>{`
					.nj-panel {
						clip-path: polygon(34px 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%);
						background:
							linear-gradient(100deg, rgba(4,14,11,.55) 0%, rgba(8,18,16,.45) 55%, rgba(20,10,32,.28) 100%),
							repeating-linear-gradient(115deg, rgba(62,230,168,.05) 0 2px, transparent 2px 9px);
						box-shadow: inset 0 0 0 1px rgba(62,230,168,.3);
					}
					@keyframes nj-hud-enter {
						0% { opacity: 0; transform: translateX(-30px) skewX(-10deg); filter: blur(10px); }
						100% { opacity: 1; transform: none; filter: blur(0); }
					}
					@keyframes nj-scene-in {
						0% { opacity: 0; filter: blur(9px); transform: translateX(26px); }
						35% { opacity: 0; }
						100% { opacity: 1; filter: blur(0); transform: none; }
					}
					@keyframes nj-blade {
						0% { opacity: 0; transform: translateX(-20px) rotate(24deg); }
						12% { opacity: 1; }
						100% { opacity: 0; transform: translateX(560px) rotate(24deg); }
					}
					@keyframes nj-spin { to { transform: rotate(360deg); } }
					@keyframes nj-smoke {
						0% { transform: translate(0, 0) scale(.9); opacity: 0; }
						30% { opacity: .75; }
						100% { transform: translate(90px, -26px) scale(1.4); opacity: 0; }
					}
					@keyframes nj-ink {
						from { stroke-dashoffset: 620; }
						to { stroke-dashoffset: 0; }
					}
					@keyframes nj-card-in {
						from { opacity: 0; transform: translateY(10px) skewX(-12deg); }
						to { opacity: 1; transform: skewX(-12deg); }
					}
					@keyframes nj-stamp {
						0% { opacity: 0; transform: scale(2.2) rotate(-18deg); }
						60% { opacity: 1; transform: scale(.92) rotate(-6deg); }
						100% { opacity: 1; transform: scale(1) rotate(-6deg); }
					}
					.nj-hud { animation: nj-hud-enter 800ms cubic-bezier(.16,.84,.2,1) both; }
					.nj-scene { animation: nj-scene-in 900ms cubic-bezier(.16,.84,.2,1) both; }
					.nj-blade { animation: nj-blade 620ms cubic-bezier(.5,0,.2,1) both; }
					.nj-spin { animation: nj-spin 9s linear infinite; }
					.nj-spin-rev { animation: nj-spin 16s linear infinite reverse; }
					.nj-smoke { animation: nj-smoke 9s ease-out infinite; }
					.nj-ink path { stroke-dasharray: 620; animation: nj-ink 1.4s cubic-bezier(.6,0,.2,1) both; }
					.nj-card { animation: nj-card-in 520ms cubic-bezier(.16,.84,.2,1) both; transform: skewX(-12deg); }
					.nj-card:nth-child(2) { animation-delay: 80ms; }
					.nj-card:nth-child(3) { animation-delay: 160ms; }
					.nj-card:nth-child(4) { animation-delay: 240ms; }
					.nj-card:nth-child(5) { animation-delay: 320ms; }
					.nj-stamp { animation: nj-stamp 520ms cubic-bezier(.2,.9,.2,1.2) 300ms both; }
				`}</style>
			</section>
		</div>
	);
}

function SessionScene({ data, gameName, games, t }: { data: LauchgruenObsResponse; gameName: string; games: Game[]; t: NinjaText }) {
	const lpDelta = data.lpDelta;
	const avgCs = averageCsPerMinute(games);
	const flow = flowState(games, t);
	const flexQueue = data.rank?.queueType === "RANKED_FLEX_SR";
	const [winsLabel, lossesLabel] = t.record(data.sessionWins, data.sessionLosses);

	return (
		<>
			<div className="flex items-start justify-between gap-6">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-[12px] tracking-[0.2em] text-[#7ff3c6]" style={KR}>
						<Kunai />
						{flexQueue ? t.flex : t.solo}
						{t === TEXT.ko ? <span className="font-mono text-[10px] font-black tracking-[0.16em] text-white/55">{flexQueue ? "FLEX" : "SOLO"}</span> : null}
					</div>
					<div className="mt-1 truncate text-[36px] leading-none tracking-[0.02em]" style={KR_STRONG}>
						{gameName}
					</div>
					<div className="mt-1.5 flex items-baseline gap-2.5">
						<span className="text-[19px] text-[#7ff3c6]" style={KR_STRONG}>
							{rankLabel(data.rank, t)}
						</span>
						<span className="font-mono text-[14px] font-black">{data.rank?.leaguePoints ?? 0} LP</span>
					</div>
				</div>

				<div className="shrink-0 text-right">
					<div className="text-[12px] tracking-[0.2em] text-[#c9a6ff]" style={KR}>
						{t.session}
					</div>
					<div className={`mt-0.5 font-mono text-[26px] font-black leading-none ${lpDelta > 0 ? "text-[#3ee6a8]" : lpDelta < 0 ? "text-[#ff5c77]" : "text-white"}`}>
						{lpDelta > 0 ? "+" : ""}
						{lpDelta} LP
					</div>
					<div className="mt-1 text-[15px]" style={KR}>
						<span className="text-[#3ee6a8]">{winsLabel}</span> <span className="text-[#ff7088]">{lossesLabel}</span>
					</div>
				</div>
			</div>

			<div className="mt-3 grid grid-cols-[1fr_132px] items-end gap-4">
				<div>
					<div className="mb-1.5 flex items-center justify-between pr-2">
						<span className="text-[12px] tracking-[0.18em]" style={KR}>
							{t.recent}
						</span>
						<span className="text-[12px] text-[#7ff3c6]" style={KR}>
							{games.length ? t.winRate(data.winRate) : t.noGames}
						</span>
					</div>
					<div className="flex gap-2.5 pl-1.5">
						{[0, 1, 2, 3, 4].map((index) => {
							const game = games[index];
							return game ? (
								<GameCard key={game.matchId} game={game} />
							) : (
								<div key={index} className="flex flex-col items-center gap-1">
									<div className="h-[46px] w-[44px] skew-x-[-12deg] border border-white/25 bg-black/25" />
									<div className="h-[13px]" />
								</div>
							);
						})}
					</div>
				</div>

				<div className="relative pb-1">
					<div className="text-[12px] tracking-[0.18em] text-[#c9a6ff]" style={KR}>
						{t.csMin}
					</div>
					<div className={`text-[38px] leading-none ${avgCs === null ? "text-white/60" : csTone(avgCs)}`} style={KR_STRONG}>
						{avgCs === null ? "–" : avgCs.toFixed(1)}
					</div>
					<div className={`mt-1 text-[27px] leading-none ${flow.tone}`} style={{ fontFamily: BRUSH }}>
						{flow.label}
					</div>
				</div>
			</div>
		</>
	);
}

function LastGameScene({ game, t }: { game: Game; t: NinjaText }) {
	const minutes = Math.floor(game.durationSeconds / 60);
	const seconds = String(game.durationSeconds % 60).padStart(2, "0");
	const cs = csPerMinute(game);

	return (
		<div className="grid grid-cols-[92px_1fr_auto] items-center gap-4">
			<div
				className="relative size-[92px] p-[3px]"
				style={{
					clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
					background: game.win ? `linear-gradient(135deg, ${JADE}, ${SHROUD})` : `linear-gradient(135deg, ${CRIMSON}, #3a0a16)`,
				}}
			>
				<div className="size-full overflow-hidden" style={{ clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className={`size-full scale-[1.25] object-cover ${game.win ? "" : "grayscale-[.5]"}`} />
				</div>
			</div>

			<div className="min-w-0">
				<div className="flex items-center gap-2 text-[12px] tracking-[0.2em] text-[#c9a6ff]" style={KR}>
					<Kunai />
					{t.recent.replace("Games", "Game")}
				</div>
				<div className="mt-0.5 truncate text-[30px] leading-none" style={KR_STRONG}>
					{game.championName}
				</div>
				<div className="mt-2.5 flex gap-4">
					<Metric label="KDA" value={game.kda} />
					<Metric label={t.csMin} value={cs === null ? String(game.creepScore) : cs.toFixed(1)} tone={cs === null ? undefined : csTone(cs)} />
					<Metric label={t.gold} value={`${(game.goldEarned / 1000).toFixed(1)}k`} />
					<Metric label={t.time} value={`${minutes}:${seconds}`} />
				</div>
				<div className="mt-2 flex gap-1.5">
					{game.items.map((item, index) => (
						<div key={`${item.id}-${index}`} className="size-[30px] skew-x-[-12deg] overflow-hidden border border-[#c9a6ff]/50 bg-black/40">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full skew-x-[12deg] scale-[1.2] object-cover" />
						</div>
					))}
				</div>
			</div>

			<div className="nj-stamp relative grid place-items-center pr-2">
				<div
					className={`${t === TEXT.ko ? "text-[64px]" : "text-[42px]"} leading-none ${game.win ? "text-[#3ee6a8]" : "text-[#ff3355]"}`}
					style={{ fontFamily: BRUSH, textShadow: `0 0 18px ${game.win ? "rgba(62,230,168,.55)" : "rgba(255,51,85,.6)"}, 0 2px 6px #000` }}
				>
					{game.win ? t.victory : t.defeat}
				</div>
				{t === TEXT.ko ? <div className="-mt-1 font-mono text-[10px] font-black tracking-[0.3em] text-white/70">{game.win ? "VICTORY" : "DEFEAT"}</div> : null}
			</div>
		</div>
	);
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
	return (
		<div>
			<div className="whitespace-nowrap text-[11px] tracking-[0.12em] text-[#c9a6ff]" style={KR}>
				{label}
			</div>
			<div className={`font-mono text-[16px] font-black ${tone ?? "text-white"}`}>{value}</div>
		</div>
	);
}

function GameCard({ game }: { game: Game }) {
	const cs = csPerMinute(game);
	return (
		<div className="flex flex-col items-center gap-1">
			<div
				className={`nj-card relative h-[46px] w-[44px] overflow-hidden border-2 ${
					game.win ? "border-[#3ee6a8] shadow-[0_0_12px_rgba(62,230,168,.55)]" : "border-[#ff3355]/80 shadow-[0_0_8px_rgba(255,51,85,.35)]"
				}`}
			>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={game.championIconUrl}
					alt={game.championName}
					className={`size-full skew-x-[12deg] scale-[1.3] object-cover ${game.win ? "" : "brightness-[.55] grayscale-[.6]"}`}
				/>
				{game.win ? null : (
					<div
						aria-hidden
						className="absolute left-1/2 top-1/2 h-[2px] w-[70px] -translate-x-1/2 -translate-y-1/2 rotate-[-58deg] bg-[#ff3355] shadow-[0_0_6px_#ff3355]"
					/>
				)}
			</div>
			<div className={`font-mono text-[10px] font-black leading-[13px] ${cs === null ? "text-white/50" : csTone(cs)}`}>{cs === null ? "–" : cs.toFixed(1)}</div>
		</div>
	);
}

function DiamondPortrait({ gameName, profileIconUrl }: { gameName: string; profileIconUrl: string | null }) {
	return (
		<div className="absolute left-[34px] top-1/2 size-[150px] -translate-y-1/2">
			<Shuriken />
			<div
				className="absolute inset-[22px] z-10 p-[3px]"
				style={{ clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", background: `linear-gradient(160deg, ${JADE}, #0d3d2e 50%, ${SHROUD})` }}
			>
				<div className="relative size-full overflow-hidden bg-[#03100c]" style={{ clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }}>
					{profileIconUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={profileIconUrl} alt={`Profilicon von ${gameName}`} className="size-full scale-[1.15] object-cover" />
					) : (
						<div className="grid size-full place-items-center text-4xl font-black text-[#3ee6a8]">{gameName.charAt(0)}</div>
					)}
					<div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(4,20,15,.75))]" />
				</div>
			</div>
		</div>
	);
}

function Shuriken() {
	return (
		<>
			<svg aria-hidden viewBox="0 0 100 100" className="nj-spin absolute inset-0 z-0 opacity-80">
				<path d="M50 2 L57 43 L98 50 L57 57 L50 98 L43 57 L2 50 L43 43 Z" fill="none" stroke={JADE} strokeWidth="1.2" style={{ filter: `drop-shadow(0 0 4px ${JADE})` }} />
				<circle cx="50" cy="50" r="5" fill="none" stroke={JADE} strokeWidth="1" />
			</svg>
			<svg aria-hidden viewBox="0 0 100 100" className="nj-spin-rev absolute -inset-[10px] z-0">
				<circle cx="50" cy="50" r="48" fill="none" stroke={SHROUD} strokeOpacity=".55" strokeWidth=".5" strokeDasharray="1 6" />
			</svg>
		</>
	);
}

/** Vertical brush text with a red name seal, like a hanging scroll. */
function SideScroll({ t }: { t: NinjaText }) {
	return (
		<div className="absolute left-0 top-[12px] flex h-[208px] w-[30px] flex-col items-center justify-between">
			<div
				className={`leading-[1.05] text-[#7ff3c6] [writing-mode:vertical-rl] ${t === TEXT.ko ? "text-[22px]" : "text-[24px] tracking-[0.06em]"}`}
				style={{ fontFamily: BRUSH, textShadow: "0 0 10px rgba(62,230,168,.55), 0 2px 4px #000" }}
			>
				{t.scroll}
			</div>
			<div
				className="grid size-[28px] rotate-[-6deg] place-items-center rounded-[4px] border-2 border-[#ff3355] bg-[#ff3355]/15 text-[17px] text-[#ff3355] shadow-[0_0_10px_rgba(255,51,85,.5)]"
				style={KR_STRONG}
			>
				{t.seal}
			</div>
		</div>
	);
}

/** Brush stroke painted along the top edge of the panel. */
function InkStroke() {
	return (
		<svg aria-hidden viewBox="0 0 600 24" preserveAspectRatio="none" className="nj-ink absolute left-[30px] right-4 top-[3px] h-[12px] w-[calc(100%-46px)]">
			<defs>
				<linearGradient id="nj-ink-grad" x1="0" x2="1">
					<stop offset="0" stopColor={JADE} />
					<stop offset=".6" stopColor={SHROUD} stopOpacity=".7" />
					<stop offset="1" stopColor={SHROUD} stopOpacity="0" />
				</linearGradient>
				<filter id="nj-ink-rough">
					<feTurbulence type="fractalNoise" baseFrequency=".9 .08" numOctaves="2" seed="7" />
					<feDisplacementMap in="SourceGraphic" scale="3" />
				</filter>
			</defs>
			<path d="M4 14 C 120 6, 260 18, 420 10 S 560 12, 596 9" fill="none" stroke="url(#nj-ink-grad)" strokeWidth="5" strokeLinecap="round" filter="url(#nj-ink-rough)" />
		</svg>
	);
}

function Kunai() {
	return (
		<svg aria-hidden viewBox="0 0 30 8" className="h-[8px] w-[30px]">
			<path d="M0 4 L18 1.5 L30 4 L18 6.5 Z" fill={JADE} style={{ filter: `drop-shadow(0 0 3px ${JADE})` }} />
			<circle cx="3" cy="4" r="2" fill="none" stroke={CRIMSON} strokeWidth="1" />
		</svg>
	);
}

function Smoke() {
	return (
		<div aria-hidden className="absolute -left-4 top-0 h-full w-[420px]">
			{[0, 1, 2].map((index) => (
				<span
					key={index}
					className="nj-smoke absolute size-[120px] rounded-full bg-[radial-gradient(circle,rgba(166,107,255,.38),transparent_68%)] blur-xl"
					style={{ left: `${40 + index * 60}px`, top: `${60 + (index % 2) * 50}px`, animationDelay: `${index * -3}s` }}
				/>
			))}
		</div>
	);
}

function csTone(value: number) {
	if (value >= 8) return "text-[#3ee6a8]";
	if (value >= 6.5) return "text-[#c9a6ff]";
	return "text-[#ff7088]";
}

function flowState(games: Game[], t: NinjaText) {
	if (!games.length) return { label: t.idle, tone: "text-white" };
	const newestResult = games[0].win;
	let streak = 0;
	for (const game of games) {
		if (game.win !== newestResult) break;
		streak += 1;
	}
	if (newestResult && streak >= 2) return { label: `${t.execution} ×${streak}`, tone: "text-[#3ee6a8]" };
	if (!newestResult && streak >= 2) return { label: `${t.shroud} ×${streak}`, tone: "text-[#c9a6ff]" };
	const momentum = games.reduce((score, game) => score + (game.win ? 1 : -1), 0);
	if (momentum > 0) return { label: `${t.momentum} +${momentum}`, tone: "text-[#3ee6a8]" };
	if (momentum < 0) return { label: `${t.momentum} ${momentum}`, tone: "text-[#ff7088]" };
	return { label: t.balance, tone: "text-white" };
}

function rankLabel(rank: LauchgruenObsResponse["rank"], t: NinjaText) {
	if (!rank) return t.unranked;
	return [t.tiers[rank.tier.toUpperCase()] ?? rank.tier, rank.rank].filter(Boolean).join(" ");
}
