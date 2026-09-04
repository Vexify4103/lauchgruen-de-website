"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";

export type RankPortraitRank = {
	tier: string;
	division: string;
	leaguePoints: number;
	wins: number;
	losses: number;
} | null;

type RankPalette = {
	primary: string;
	secondary: string;
	highlight: string;
	shadow: string;
};

const RANK_PALETTES: Record<string, RankPalette> = {
	UNRANKED: { primary: "#98a59f", secondary: "#44534d", highlight: "#d7e2dc", shadow: "rgba(152,165,159,.48)" },
	IRON: { primary: "#9d8d83", secondary: "#4f4642", highlight: "#ddd0c8", shadow: "rgba(157,141,131,.55)" },
	BRONZE: { primary: "#cf8355", secondary: "#6f3928", highlight: "#ffd0a8", shadow: "rgba(207,131,85,.58)" },
	SILVER: { primary: "#b8d0da", secondary: "#607c8d", highlight: "#effcff", shadow: "rgba(184,208,218,.62)" },
	GOLD: { primary: "#f4c451", secondary: "#9a651d", highlight: "#fff1a8", shadow: "rgba(244,196,81,.66)" },
	PLATINUM: { primary: "#62ded1", secondary: "#277f7b", highlight: "#c9fff7", shadow: "rgba(98,222,209,.62)" },
	EMERALD: { primary: "#42e895", secondary: "#147b52", highlight: "#c6ffe0", shadow: "rgba(66,232,149,.64)" },
	DIAMOND: { primary: "#7bd9ff", secondary: "#676ee8", highlight: "#f0d5ff", shadow: "rgba(123,217,255,.68)" },
	MASTER: { primary: "#d17cff", secondary: "#7b34c8", highlight: "#ffb1dc", shadow: "rgba(209,124,255,.7)" },
	GRANDMASTER: { primary: "#ff665f", secondary: "#a92345", highlight: "#ffc36f", shadow: "rgba(255,102,95,.72)" },
	CHALLENGER: { primary: "#67d9ff", secondary: "#2b6cd4", highlight: "#f4d46b", shadow: "rgba(103,217,255,.74)" },
};

const RANK_LABELS: Record<string, string> = {
	IRON: "Iron",
	BRONZE: "Bronze",
	SILVER: "Silber",
	GOLD: "Gold",
	PLATINUM: "Platin",
	EMERALD: "Smaragd",
	DIAMOND: "Diamant",
	MASTER: "Master",
	GRANDMASTER: "Grandmaster",
	CHALLENGER: "Challenger",
};

const RANK_CRESTS: Record<string, { folder: string; base: string }> = {
	IRON: { folder: "01_iron", base: "01_iron_base.png" },
	BRONZE: { folder: "02_bronze", base: "02_bronze_base.png" },
	SILVER: { folder: "03_silver", base: "03_silver_base.png" },
	GOLD: { folder: "04_gold", base: "04_gold_base.png" },
	PLATINUM: { folder: "05_platinum", base: "05_platinum_base_new.png" },
	EMERALD: { folder: "emerald", base: "emerald_base.png" },
	DIAMOND: { folder: "06_diamond", base: "06_diamond_base.png" },
	MASTER: { folder: "07_master", base: "07_master_base.png" },
	GRANDMASTER: { folder: "08_grandmaster", base: "08_grandmaster_base.png" },
	CHALLENGER: { folder: "09_challenger", base: "09_challenger_base.png" },
};

const CREST_ROOT = "https://raw.communitydragon.org/latest/game/assets/loadouts/regalia/crests/ranked";

export function RankPortraitOverlay({
	riotId,
	profileIconUrl,
	rank,
	sessionWins = 0,
	sessionLosses = 0,
}: {
	riotId: string;
	profileIconUrl: string | null;
	rank: RankPortraitRank;
	sessionWins?: number;
	sessionLosses?: number;
}) {
	const [scene, setScene] = useState(0);
	const flameFilterId = `rank-flame-${useId().replaceAll(":", "")}`;
	const tier = rank?.tier.toUpperCase() ?? "UNRANKED";
	const palette = RANK_PALETTES[tier] ?? RANK_PALETTES.UNRANKED;
	const [rawGameName] = riotId.split("#");
	const gameName = rawGameName?.trim() || "Summoner";
	const overallWins = rank?.wins ?? 0;
	const overallLosses = rank?.losses ?? 0;
	const crest = RANK_CRESTS[tier];
	const crestBaseUrl = crest ? `${CREST_ROOT}/${crest.folder}/${crest.base}` : null;
	const crestMaskStyle = crestBaseUrl ? ({ WebkitMaskImage: `url("${crestBaseUrl}")`, maskImage: `url("${crestBaseUrl}")` } as CSSProperties) : undefined;
	const style = {
		"--rank-primary": palette.primary,
		"--rank-secondary": palette.secondary,
		"--rank-highlight": palette.highlight,
		"--rank-shadow": palette.shadow,
	} as CSSProperties;

	useEffect(() => {
		const interval = window.setInterval(() => setScene((current) => (current + 1) % 3), 30_000);
		return () => window.clearInterval(interval);
	}, []);

	return (
		<div
			style={style}
			className="rank-portrait-root flex h-[400px] w-[340px] flex-col items-center justify-start overflow-visible bg-transparent px-5 pt-2 text-center text-white"
		>
			<svg aria-hidden className="pointer-events-none absolute size-0" focusable="false">
				<defs>
					<filter id={flameFilterId} x="-30%" y="-30%" width="160%" height="175%" colorInterpolationFilters="sRGB">
						<feTurbulence type="fractalNoise" baseFrequency="0.012 0.075" numOctaves="2" seed="8" result="flameNoise">
							<animate attributeName="baseFrequency" values="0.012 0.075;0.018 0.12;0.01 0.09;0.012 0.075" dur="4.8s" repeatCount="indefinite" />
						</feTurbulence>
						<feDisplacementMap in="SourceGraphic" in2="flameNoise" scale="11" xChannelSelector="R" yChannelSelector="B" result="flameShape">
							<animate attributeName="scale" values="7;14;9;12;7" dur="4.2s" repeatCount="indefinite" />
						</feDisplacementMap>
						<feGaussianBlur in="flameShape" stdDeviation="1.4" result="flameGlow" />
						<feMerge>
							<feMergeNode in="flameGlow" />
							<feMergeNode in="flameShape" />
						</feMerge>
					</filter>
				</defs>
			</svg>
			<div className="rank-portrait-frame relative h-[286px] w-[320px] shrink-0 overflow-visible">
				<div aria-hidden className="rank-portrait-glow absolute inset-0 m-auto size-[158px] rounded-full" />
				<div className="rank-portrait-moving-layer absolute inset-0">
					<div className="absolute left-1/2 top-1/2 z-30 size-[116px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-[var(--rank-highlight)]/80 bg-[#07100d] shadow-[0_0_28px_var(--rank-shadow),inset_0_0_18px_rgba(0,0,0,.72)]">
						{profileIconUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={profileIconUrl} alt={`Profilicon von ${gameName}`} className="size-full object-cover" />
						) : (
							<div className="grid size-full place-items-center bg-[radial-gradient(circle_at_35%_25%,var(--rank-primary),var(--rank-secondary)_58%,#07100d)] text-6xl font-black uppercase text-white/85">
								{gameName.charAt(0)}
							</div>
						)}
						<div aria-hidden className="absolute inset-0 rounded-full bg-[linear-gradient(145deg,rgba(255,255,255,.2),transparent_36%,rgba(0,0,0,.2))]" />
					</div>
					<div aria-hidden className="rank-portrait-fire absolute inset-0 z-[25] m-auto size-[154px] rounded-full" />
					<div aria-hidden className="rank-portrait-fire-core absolute inset-0 z-[25] m-auto size-[140px] rounded-full" />
					{crestBaseUrl ? (
						<>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img aria-hidden src={crestBaseUrl} alt="" className="rank-portrait-crest-position rank-portrait-crest-aura pointer-events-none z-0 object-contain" />
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img aria-hidden src={crestBaseUrl} alt="" className="rank-portrait-crest-position pointer-events-none z-10 object-contain" />
							<div
								aria-hidden
								style={{ ...crestMaskStyle, filter: `url(#${flameFilterId}) drop-shadow(0 0 3px var(--rank-primary))` }}
								className="rank-portrait-crest-position rank-portrait-crest-fire pointer-events-none z-[12]"
							/>
						</>
					) : null}
				</div>
			</div>

			<div className="relative z-10 -mt-6 flex max-w-full items-baseline justify-center gap-1.5 truncate px-3 [text-shadow:0_3px_12px_rgba(0,0,0,.95)]">
				<span className="truncate text-[25px] font-black tracking-[-0.035em] text-white">{gameName}</span>
			</div>
			<div key={scene} className="rank-portrait-stat mt-1.5 min-h-8 text-[19px] font-black [text-shadow:0_2px_10px_rgba(0,0,0,.98)]">
				{scene === 0 ? (
					<RankLine rank={rank} tier={tier} />
				) : scene === 1 ? (
					<>
						<span className="text-[var(--rank-primary)]">Session</span>
						<span className="ml-2 text-white">
							{sessionWins}W · {sessionLosses}L
						</span>
					</>
				) : (
					<>
						<span className="text-[var(--rank-primary)]">Gesamt</span>
						<span className="ml-2 text-white">
							{overallWins}W · {overallLosses}L
						</span>
					</>
				)}
			</div>

			<style>{`
				@keyframes rank-portrait-breathe {
					0%, 100% { opacity: .58; transform: scale(.96); filter: blur(13px); }
					50% { opacity: .95; transform: scale(1.045); filter: blur(17px); }
				}
				@keyframes rank-portrait-crest-alive {
					0% { transform: translateY(0) rotate(-.35deg) scale(1); filter: brightness(.95) saturate(1.04) drop-shadow(-3px -2px 8px var(--rank-shadow)); }
					28% { transform: translateY(-1px) rotate(.2deg) scale(1.012, .994); filter: brightness(1.12) saturate(1.22) drop-shadow(4px -5px 14px var(--rank-shadow)); }
					61% { transform: translateY(1px) rotate(.45deg) scale(.996, 1.012); filter: brightness(1.02) saturate(1.12) drop-shadow(-4px 3px 11px var(--rank-shadow)); }
					100% { transform: translateY(0) rotate(-.35deg) scale(1); filter: brightness(.95) saturate(1.04) drop-shadow(-3px -2px 8px var(--rank-shadow)); }
				}
				@keyframes rank-portrait-aura-flicker {
					0%, 100% { opacity: .34; filter: blur(11px) saturate(1.35) brightness(.92); }
					38% { opacity: .62; filter: blur(15px) saturate(1.65) brightness(1.16); }
					72% { opacity: .44; filter: blur(12px) saturate(1.48) brightness(1.02); }
				}
				@keyframes rank-portrait-fire-spin {
					to { transform: rotate(360deg); }
				}
				@keyframes rank-portrait-fire-drift {
					0%, 100% { transform: rotate(0deg) scale(.98); opacity: .72; }
					35% { transform: rotate(-125deg) scale(1.06, .96); opacity: 1; }
					70% { transform: rotate(-245deg) scale(.96, 1.05); opacity: .82; }
				}
				@keyframes rank-portrait-flame-tongues-a {
					0% { transform: translateY(18px) skewX(-3deg) scale(.98, .78); opacity: .2; }
					24% { opacity: 1; }
					58% { transform: translateY(-3px) skewX(4deg) scale(1.02, 1.08); opacity: .9; }
					100% { transform: translateY(-25px) skewX(-2deg) scale(.95, 1.18); opacity: 0; }
				}
				@keyframes rank-portrait-flame-tongues-b {
					0% { transform: translateY(22px) skewX(4deg) scale(.94, .74); opacity: .14; }
					18% { opacity: .88; }
					62% { transform: translateY(-6px) skewX(-4deg) scale(1.03, 1.12); opacity: .94; }
					100% { transform: translateY(-31px) skewX(2deg) scale(.92, 1.22); opacity: 0; }
				}
				@keyframes rank-portrait-stat-in {
					0% { opacity: 0; transform: translateX(24px); filter: blur(5px); }
					100% { opacity: 1; transform: translateX(0); filter: blur(0); }
				}
				.rank-portrait-glow { background: var(--rank-primary); animation: rank-portrait-breathe 3.8s ease-in-out infinite; }
				.rank-portrait-moving-layer { transform-origin: 50% 50%; animation: rank-portrait-crest-alive 7.2s ease-in-out infinite; }
				.rank-portrait-crest-position { position: absolute; left: 50%; top: 50%; width: 510px; height: 510px; max-width: none; margin-left: -255px; margin-top: -255px; }
				.rank-portrait-crest-aura { animation: rank-portrait-aura-flicker 2.7s ease-in-out infinite; }
				.rank-portrait-crest-fire { overflow: hidden; mix-blend-mode: screen; opacity: .96; background: transparent; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; -webkit-mask-size: contain; mask-size: contain; }
				.rank-portrait-crest-fire::before, .rank-portrait-crest-fire::after { content: ""; position: absolute; inset: -10% 2% -8%; transform-origin: 50% 100%; background-repeat: no-repeat; will-change: transform, opacity; }
				.rank-portrait-crest-fire::before { background-image: radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 7%, var(--rank-primary) 19%, transparent 58%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 8%, var(--rank-secondary) 21%, transparent 60%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 56%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 20%, transparent 59%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 55%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 20%, transparent 58%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 19%, transparent 57%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 20%, transparent 59%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 56%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 8%, var(--rank-secondary) 21%, transparent 60%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 7%, var(--rank-primary) 19%, transparent 58%); background-position: -1% 70%, 9% 64%, 19% 73%, 29% 61%, 39% 69%, 50% 63%, 61% 70%, 71% 60%, 81% 72%, 91% 64%, 101% 69%; background-size: 13% 48%, 12% 36%, 13% 55%, 12% 41%, 13% 51%, 13% 38%, 13% 53%, 12% 40%, 13% 56%, 12% 37%, 13% 49%; animation: rank-portrait-flame-tongues-a 2.35s cubic-bezier(.45,0,.55,1) infinite; }
				.rank-portrait-crest-fire::after { inset: -6% 4% -4%; background-image: radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 56%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 20%, transparent 58%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 55%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 19%, transparent 57%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 56%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 20%, transparent 58%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 55%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 19%, transparent 57%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 18%, transparent 56%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 20%, transparent 58%); background-position: 4% 76%, 14% 69%, 24% 78%, 35% 67%, 46% 75%, 57% 68%, 68% 77%, 78% 66%, 89% 75%, 99% 70%; background-size: 12% 34%, 11% 47%, 12% 38%, 11% 50%, 12% 35%, 11% 46%, 12% 37%, 11% 49%, 12% 35%, 11% 44%; animation: rank-portrait-flame-tongues-b 1.95s cubic-bezier(.4,0,.6,1) -.8s infinite; }
				.rank-portrait-fire { background: conic-gradient(from 20deg, transparent 0 7%, var(--rank-primary) 12%, transparent 19% 29%, var(--rank-highlight) 34%, transparent 41% 57%, var(--rank-secondary) 64%, transparent 72% 84%, var(--rank-primary) 91%, transparent); filter: blur(7px) drop-shadow(0 0 8px var(--rank-shadow)); opacity: .62; -webkit-mask: radial-gradient(circle, transparent 47%, #000 57% 73%, transparent 83%); mask: radial-gradient(circle, transparent 47%, #000 57% 73%, transparent 83%); animation: rank-portrait-fire-spin 4.6s linear infinite; }
				.rank-portrait-fire-core { background: conic-gradient(from 210deg, transparent, var(--rank-highlight), transparent 22%, var(--rank-primary), transparent 48%, var(--rank-highlight), transparent 70%); filter: blur(4px) drop-shadow(0 0 6px var(--rank-primary)); opacity: .58; -webkit-mask: radial-gradient(circle, transparent 50%, #000 59% 72%, transparent 82%); mask: radial-gradient(circle, transparent 50%, #000 59% 72%, transparent 82%); animation: rank-portrait-fire-drift 3.1s ease-in-out infinite; }
				.rank-portrait-stat { animation: rank-portrait-stat-in 680ms cubic-bezier(.22,.8,.2,1); }
			`}</style>
		</div>
	);
}

function isApexTier(tier: string) {
	return tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER";
}

function RankLine({ rank, tier }: { rank: RankPortraitRank; tier: string }) {
	return (
		<div className="text-[19px] font-black">
			<span className="text-[var(--rank-primary)]">{rank ? `${RANK_LABELS[tier] ?? tier}${isApexTier(tier) ? "" : ` ${rank.division}`}` : "Unranked"}</span>
			{rank ? <span className="ml-2 text-white">{rank.leaguePoints} LP</span> : null}
		</div>
	);
}
