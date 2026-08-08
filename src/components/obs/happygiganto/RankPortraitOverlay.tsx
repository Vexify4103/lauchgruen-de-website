"use client";

import { useEffect, useState, type CSSProperties } from "react";

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
	sessionWins,
	sessionLosses,
}: {
	riotId: string;
	profileIconUrl: string | null;
	rank: RankPortraitRank;
	sessionWins: number;
	sessionLosses: number;
}) {
	const [scene, setScene] = useState(0);
	const tier = rank?.tier.toUpperCase() ?? "UNRANKED";
	const palette = RANK_PALETTES[tier] ?? RANK_PALETTES.UNRANKED;
	const gameName = riotId.split("#")[0]?.trim() || "Summoner";
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
							<div aria-hidden style={crestMaskStyle} className="rank-portrait-crest-position rank-portrait-crest-fire pointer-events-none z-[22]" />
						</>
					) : null}
				</div>
			</div>

			<div className="relative z-10 -mt-6 max-w-full truncate px-3 text-[27px] font-black tracking-[-0.035em] text-white [text-shadow:0_3px_12px_rgba(0,0,0,.95)]">
				{gameName}
			</div>
			<div key={scene} className="rank-portrait-stat mt-1.5 min-h-8 text-[19px] font-black [text-shadow:0_2px_10px_rgba(0,0,0,.98)]">
				{scene === 0 ? (
					<>
						<span className="text-[var(--rank-primary)]">{rank ? `${RANK_LABELS[tier] ?? tier}${isApexTier(tier) ? "" : ` ${rank.division}`}` : "Unranked"}</span>
						{rank ? <span className="ml-2 text-white">{rank.leaguePoints} LP</span> : null}
					</>
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
					0%, 100% { transform: translateY(6px) skewX(-2deg) scale(.98, .82); opacity: .64; }
					27% { transform: translateY(-4px) skewX(4deg) scale(1.03, 1.12); opacity: .98; }
					58% { transform: translateY(1px) skewX(-5deg) scale(.96, .94); opacity: .76; }
					81% { transform: translateY(-7px) skewX(2deg) scale(1.01, 1.08); opacity: .94; }
				}
				@keyframes rank-portrait-flame-tongues-b {
					0%, 100% { transform: translateY(-2px) skewX(4deg) scale(.94, 1.04); opacity: .72; }
					36% { transform: translateY(5px) skewX(-4deg) scale(1.04, .86); opacity: .58; }
					69% { transform: translateY(-8px) skewX(1deg) scale(.98, 1.15); opacity: 1; }
				}
				@keyframes rank-portrait-stat-in {
					0% { opacity: 0; transform: translateX(24px); filter: blur(5px); }
					100% { opacity: 1; transform: translateX(0); filter: blur(0); }
				}
				.rank-portrait-glow { background: var(--rank-primary); animation: rank-portrait-breathe 3.8s ease-in-out infinite; }
				.rank-portrait-moving-layer { transform-origin: 50% 50%; animation: rank-portrait-crest-alive 7.2s ease-in-out infinite; }
				.rank-portrait-crest-position { position: absolute; left: 50%; top: 50%; width: 510px; height: 510px; max-width: none; margin-left: -255px; margin-top: -255px; }
				.rank-portrait-crest-aura { animation: rank-portrait-aura-flicker 2.7s ease-in-out infinite; }
				.rank-portrait-crest-fire { overflow: hidden; mix-blend-mode: screen; filter: brightness(1.38) saturate(1.85) contrast(1.08) drop-shadow(0 0 5px var(--rank-primary)); -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; -webkit-mask-size: contain; mask-size: contain; }
				.rank-portrait-crest-fire::before, .rank-portrait-crest-fire::after { content: ""; position: absolute; left: 5%; right: 5%; bottom: 10%; height: 60%; transform-origin: 50% 100%; background-repeat: no-repeat; }
				.rank-portrait-crest-fire::before { background-image: radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 7%, var(--rank-primary) 22%, transparent 64%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 8%, var(--rank-secondary) 24%, transparent 65%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 20%, transparent 62%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 22%, transparent 64%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 5%, var(--rank-primary) 19%, transparent 60%); background-position: 4% 100%, 25% 100%, 49% 100%, 72% 100%, 95% 100%; background-size: 24% 86%, 22% 66%, 25% 96%, 22% 72%, 20% 88%; animation: rank-portrait-flame-tongues-a 2.15s ease-in-out infinite; }
				.rank-portrait-crest-fire::after { bottom: 18%; height: 50%; background-image: radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 6%, var(--rank-primary) 20%, transparent 61%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 7%, var(--rank-secondary) 21%, transparent 63%), radial-gradient(ellipse at 50% 100%, var(--rank-highlight) 0 5%, var(--rank-primary) 18%, transparent 60%), radial-gradient(ellipse at 50% 100%, var(--rank-primary) 0 6%, var(--rank-secondary) 20%, transparent 61%); background-position: 13% 100%, 39% 100%, 66% 100%, 89% 100%; background-size: 25% 76%, 22% 95%, 24% 72%, 21% 88%; animation: rank-portrait-flame-tongues-b 1.73s ease-in-out infinite; }
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
