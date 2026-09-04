"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { CommunityObsGame, CommunityObsSnapshot } from "@/lib/community-obs";
import { RankPortraitOverlay } from "@/components/obs/shared/RankPortraitOverlay";
import { FREEFORM_CANVAS, communityOverlayParams, type CommunityOverlayConfig, type FreeformElementType, type FreeformOverlayElement } from "@/lib/community-overlay-config";

export function CommunityPerformanceOverlay({
	config,
	preview = false,
	freeformEditorOptions = { grid: true, snap: true, safeArea: true },
}: {
	config: CommunityOverlayConfig;
	preview?: boolean;
	freeformEditorOptions?: { grid: boolean; snap: boolean; safeArea: boolean };
}) {
	const [data, setData] = useState<CommunityObsSnapshot | null>(null);
	const [error, setError] = useState("");
	const [clock, setClock] = useState(() => Date.now());
	const endpoint = useMemo(() => `/api/obs/community?${communityOverlayParams(config, preview).toString()}`, [config, preview]);

	useEffect(() => {
		let cancelled = false;
		const controller = new AbortController();
		async function refresh() {
			try {
				const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
				const json = (await response.json()) as CommunityObsSnapshot & { message?: string };
				if (!response.ok) throw new Error(json.message || "Overlay-Daten konnten nicht geladen werden.");
				if (!cancelled) {
					setData(json);
					setError("");
				}
			} catch (reason) {
				if (!cancelled && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Overlay-Daten konnten nicht geladen werden.");
			}
		}
		void refresh();
		const interval = window.setInterval(refresh, 60_000);
		return () => {
			cancelled = true;
			controller.abort();
			window.clearInterval(interval);
		};
	}, [endpoint]);

	useEffect(() => {
		const interval = window.setInterval(() => setClock(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, []);

	useEffect(() => {
		if (!preview || !data) return;
		window.parent.postMessage(
			{
				type: "community-overlay-rank",
				accountId: data.accountId,
				riotId: data.riotId,
				score: data.rank?.score ?? null,
				label: data.rank?.label ?? "",
				tier: data.rank?.tier ?? "",
				leaguePoints: data.rank?.leaguePoints ?? null,
			},
			window.location.origin
		);
	}, [data, preview]);

	const surfaceStyle = {
		"--overlay-primary": config.primary,
		"--overlay-secondary": config.secondary,
		"--overlay-highlight": config.highlight,
		"--overlay-text": config.text,
		"--overlay-background": config.showBackground ? withOpacity(config.background, config.backgroundOpacity) : "transparent",
		"--overlay-border": config.showBorder ? config.border : "transparent",
	} as CSSProperties;

	if (!config.accountId && !config.ingame) return <OverlayNotice text="Riot-ID im Overlay-Builder eintragen." />;
	if (!data) return <OverlayNotice text={error || "Overlay wird geladen…"} />;
	if (config.hideOutsideLeague && config.streamer && data.online && !data.leagueLive) {
		return preview ? <OverlayNotice text="Ausgeblendet: Der Twitch-Kanal streamt gerade nicht League of Legends." /> : null;
	}
	if (config.style === "freeform")
		return <FreeformOverlay data={data} config={config} style={surfaceStyle} clock={clock} editor={preview} editorOptions={freeformEditorOptions} />;
	if (config.style === "portrait") {
		return (
			<RankPortraitOverlay
				riotId={data.riotId}
				profileIconUrl={data.profileIconUrl}
				rank={
					data.rank
						? {
								tier: data.rank.tier,
								division: data.rank.division,
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

	let primaryOverlay = <DefaultOverlay data={data} config={config} style={surfaceStyle} clock={clock} />;
	if (config.style === "compact") primaryOverlay = <CompactOverlay data={data} config={config} style={surfaceStyle} clock={clock} />;
	if (config.style === "session") primaryOverlay = <SessionOverlay data={data} config={config} style={surfaceStyle} clock={clock} />;
	if (config.style === "banner") primaryOverlay = <BannerOverlay data={data} config={config} style={surfaceStyle} clock={clock} />;
	if (config.style === "rail") primaryOverlay = <RankRailOverlay data={data} config={config} style={surfaceStyle} clock={clock} />;
	if (config.style === "floating") primaryOverlay = <FloatingOverlay data={data} config={config} style={surfaceStyle} clock={clock} />;
	if (config.rotateLastGame && data.games[0]) {
		return (
			<RotatingScenes
				key={`${config.style}:${data.games[0].matchId}`}
				primary={primaryOverlay}
				lastGame={<LastGameOverlay game={data.games[0]} data={data} config={config} style={surfaceStyle} />}
			/>
		);
	}
	return primaryOverlay;
}

function RotatingScenes({ primary, lastGame }: { primary: React.ReactNode; lastGame: React.ReactNode }) {
	const [showLastGame, setShowLastGame] = useState(false);
	useEffect(() => {
		const interval = window.setInterval(() => setShowLastGame((current) => !current), 30_000);
		return () => window.clearInterval(interval);
	}, []);
	return (
		<div className="inline-grid overflow-hidden [&>*]:col-start-1 [&>*]:row-start-1">
			<div
				className={`transform-gpu transition-[transform,opacity,filter] duration-700 ease-[cubic-bezier(.22,.8,.2,1)] ${showLastGame ? "pointer-events-none -translate-x-[9%] scale-[0.985] opacity-0 blur-sm" : "translate-x-0 scale-100 opacity-100 blur-0"}`}
			>
				{primary}
			</div>
			<div
				className={`transform-gpu transition-[transform,opacity,filter] duration-700 ease-[cubic-bezier(.22,.8,.2,1)] ${showLastGame ? "translate-x-0 scale-100 opacity-100 blur-0" : "pointer-events-none translate-x-[9%] scale-[0.985] opacity-0 blur-sm"}`}
			>
				{lastGame}
			</div>
		</div>
	);
}

function Frame({ children, config, style, className = "" }: { children: React.ReactNode; config: CommunityOverlayConfig; style: CSSProperties; className?: string }) {
	return (
		<section
			style={style}
			className={`relative overflow-hidden text-[var(--overlay-text)] ${config.showBorder ? "border" : ""} ${
				config.showBackground ? "bg-[var(--overlay-background)] shadow-2xl shadow-black/35 backdrop-blur-xl" : "bg-transparent"
			} ${config.flip ? "[direction:rtl]" : ""} ${className}`}
		>
			{config.showBorder ? (
				<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--overlay-primary)] to-transparent opacity-80" />
			) : null}
			{config.showBackground ? (
				<div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-[var(--overlay-secondary)] opacity-[0.09] blur-3xl" />
			) : null}
			<div className="relative [direction:ltr]">{children}</div>
		</section>
	);
}

function DefaultOverlay({ data, config, style, clock }: OverlayProps) {
	return (
		<div className="p-4">
			<Frame config={config} style={{ ...style, borderColor: "var(--overlay-border)" }} className="w-[760px] rounded-[1.7rem] p-5">
				<Header data={data} config={config} clock={clock} />
				<div className={`mt-4 grid gap-4 ${config.flip ? "grid-cols-[1fr_17rem] [&>*:first-child]:order-2" : "grid-cols-[17rem_1fr]"}`}>
					<RankPanel data={data} config={config} />
					<div className="min-w-0">
						<SessionStats data={data} config={config} />
						{config.showHistory ? <History games={data.games} rows={config.historyRows} config={config} className="mt-3" /> : null}
					</div>
				</div>
				{config.showLiveGame && data.liveGame ? <LiveGame data={data.liveGame} showQueue={config.showQueue} clock={clock} /> : null}
				{config.showStreamerParticipants && !config.showLiveGame && data.liveGame ? <StreamerParticipants data={data.liveGame} /> : null}
			</Frame>
		</div>
	);
}

function CompactOverlay({ data, config, style, clock }: OverlayProps) {
	return (
		<div className="p-3">
			<Frame config={config} style={{ ...style, borderColor: "var(--overlay-border)" }} className="w-[490px] rounded-2xl px-4 py-3">
				<div className={`flex items-center gap-4 ${config.flip ? "flex-row-reverse" : ""}`}>
					<div className="min-w-0 flex-1">
						<div className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-[var(--overlay-secondary)]">{data.riotId}</div>
						<div className="mt-1 flex items-end gap-2">
							{config.showRank ? <span className="text-xl font-black">{data.rank?.label ?? "Unranked"}</span> : null}
							{config.showRank && data.rank ? <span className="pb-0.5 text-xs font-black text-[var(--overlay-highlight)]">{data.rank.leaguePoints} LP</span> : null}
						</div>
						{config.showQueue ? <QueueBadge data={data} className="mt-1.5" /> : null}
					</div>
					{config.showWinRate ? <MiniStat label="Session-WR" value={`${sessionWinRate(data)}%`} /> : null}
					{config.showLp ? <MiniStat label="LP-Delta" value={sessionLpLabel(data)} tone={sessionLpTone(data)} /> : null}
					{data.leagueLive ? <MiniStat label="Live" value={duration(data.streamStartedAt, clock)} /> : null}
				</div>
				{config.showGoal && data.rank ? <Progress rank={data.rank} config={config} apexGoals={data.apexGoals} className="mt-3" /> : null}
				{config.showHistory ? <History games={data.games} rows={config.historyRows} config={config} compact className="mt-3" /> : null}
				{config.showLiveGame && data.liveGame ? <LiveGame data={data.liveGame} showQueue={config.showQueue} clock={clock} compact /> : null}
				{config.showStreamerParticipants && !config.showLiveGame && data.liveGame ? <StreamerParticipants data={data.liveGame} compact /> : null}
			</Frame>
		</div>
	);
}

function SessionOverlay({ data, config, style, clock }: OverlayProps) {
	return (
		<div className="p-4">
			<Frame config={config} style={{ ...style, borderColor: "var(--overlay-border)" }} className="w-[820px] rounded-[1.7rem] p-5">
				<div className={`flex items-center justify-between gap-6 ${config.flip ? "flex-row-reverse" : ""}`}>
					<Header data={data} config={config} clock={clock} compact />
					<div className="flex items-center gap-3">
						<HeroStat label="Session" value={`${data.sessionWins}W · ${data.sessionLosses}L`} />
						{config.showLp ? <HeroStat label="LP-Veränderung" value={sessionLpLabel(data)} tone={sessionLpTone(data)} /> : null}
						{config.showWinRate ? <HeroStat label="Session-Winrate" value={`${sessionWinRate(data)}%`} /> : null}
					</div>
				</div>
				{config.showHistory ? <History games={data.games} rows={config.historyRows} config={config} className="mt-4" /> : null}
				{config.showLiveGame && data.liveGame ? <LiveGame data={data.liveGame} showQueue={config.showQueue} clock={clock} /> : null}
				{config.showStreamerParticipants && !config.showLiveGame && data.liveGame ? <StreamerParticipants data={data.liveGame} /> : null}
			</Frame>
		</div>
	);
}

function BannerOverlay({ data, config, style, clock }: OverlayProps) {
	return (
		<div className="p-3">
			<Frame config={config} style={{ ...style, borderColor: "var(--overlay-border)" }} className="w-[1180px] rounded-2xl px-5 py-3">
				<div className={`flex items-center gap-6 ${config.flip ? "flex-row-reverse" : ""}`}>
					<div className="min-w-0 flex-1">
						<div className="truncate text-xs font-black uppercase tracking-[0.22em] text-[var(--overlay-secondary)]">{data.riotId}</div>
						<div className="mt-1 flex items-baseline gap-3">
							{config.showRank ? <span className="text-2xl font-black">{data.rank?.label ?? "Unranked"}</span> : null}
							{data.rank ? <span className="font-black text-[var(--overlay-highlight)]">{data.rank.leaguePoints} LP</span> : null}
						</div>
						{config.showQueue ? <QueueBadge data={data} className="mt-1" /> : null}
					</div>
					{config.showGoal && data.rank ? (
						<div className="w-64">
							<Progress rank={data.rank} config={config} apexGoals={data.apexGoals} />
						</div>
					) : null}
					{config.showWinRate ? <HeroStat label="Session-WR" value={`${sessionWinRate(data)}%`} /> : null}
					<HeroStat label="Session" value={`${data.sessionWins}W · ${data.sessionLosses}L`} />
					{config.showLp ? <HeroStat label="LP" value={sessionLpLabel(data, false)} tone={sessionLpTone(data)} /> : null}
					{data.leagueLive ? <HeroStat label="Live seit" value={duration(data.streamStartedAt, clock)} /> : null}
				</div>
				{config.showHistory ? <History games={data.games} rows={config.historyRows} config={config} compact className="mt-3" /> : null}
				{config.showStreamerParticipants && data.liveGame ? <StreamerParticipants data={data.liveGame} compact /> : null}
			</Frame>
		</div>
	);
}

function RankRailOverlay({ data, config, style, clock }: OverlayProps) {
	const goal = data.rank ? goalProgress(data.rank, config, data.apexGoals) : null;
	return (
		<div className="p-4">
			<Frame config={config} style={{ ...style, borderColor: "var(--overlay-border)" }} className="w-[328px] rounded-[1.8rem] p-4">
				<div className={`flex items-start justify-between gap-3 ${config.flip ? "flex-row-reverse text-right" : ""}`}>
					<div className="min-w-0">
						<div className="text-[7px] font-black uppercase tracking-[0.28em] text-[var(--overlay-primary)]">Rank Rail</div>
						<div className="mt-1 truncate text-sm font-black text-[var(--overlay-secondary)]">{data.riotId}</div>
						{config.showQueue ? <QueueBadge data={data} className="mt-1.5" /> : null}
					</div>
					{data.leagueLive ? (
						<div className="shrink-0 text-right">
							<div className="text-[7px] font-black uppercase tracking-[0.18em] text-[var(--overlay-highlight)]">Session</div>
							<div className="mt-1 font-mono text-xs font-black tabular-nums">{duration(data.streamStartedAt, clock)}</div>
						</div>
					) : null}
				</div>

				{config.showRank ? (
					<div className={`mt-4 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-3 ${config.flip ? "text-right" : ""}`}>
						<div className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40">Aktueller Rang</div>
						<div className={`mt-1 flex items-end justify-between gap-3 ${config.flip ? "flex-row-reverse" : ""}`}>
							<div className="truncate text-xl font-black tracking-tight">{data.rank?.label ?? "Unranked"}</div>
							{data.rank ? <div className="pb-0.5 font-mono text-base font-black text-[var(--overlay-highlight)]">{data.rank.leaguePoints} LP</div> : null}
						</div>
					</div>
				) : null}

				<div className={`mt-3 grid items-stretch gap-3 ${config.showGoal && goal ? (config.flip ? "grid-cols-[1fr_4.2rem]" : "grid-cols-[4.2rem_1fr]") : "grid-cols-1"}`}>
					{config.showGoal && goal && !config.flip ? <RailProgress goal={goal} /> : null}
					<div className="min-w-0">
						<div className={`grid grid-cols-2 gap-2 ${config.flip ? "text-right" : ""}`}>
							<RailStat label="Session" value={`${data.sessionWins}W · ${data.sessionLosses}L`} />
							{config.showLp ? <RailStat label="LP-Delta" value={sessionLpLabel(data)} tone={sessionLpTone(data)} /> : null}
							{config.showWinRate ? <RailStat label="Session-WR" value={`${sessionWinRate(data)}%`} /> : null}
							<RailStat label="Spiele" value={String(data.sessionWins + data.sessionLosses)} />
						</div>
						{config.showHistory ? <RailHistory games={data.games} rows={config.historyRows} config={config} flip={config.flip} /> : null}
					</div>
					{config.showGoal && goal && config.flip ? <RailProgress goal={goal} flip /> : null}
				</div>
				{config.showStreamerParticipants && data.liveGame ? <StreamerParticipants data={data.liveGame} compact /> : null}
			</Frame>
		</div>
	);
}

function FloatingOverlay({ data, config, style, clock }: OverlayProps) {
	return (
		<div
			style={style}
			className={`w-[620px] bg-transparent p-5 text-[var(--overlay-text)] [text-shadow:0_2px_9px_rgba(0,0,0,0.98),0_1px_2px_rgba(0,0,0,1)] ${
				config.flip ? "ml-auto flex flex-col items-end text-right" : ""
			}`}
		>
			<div className={`flex items-end gap-3 ${config.flip ? "flex-row-reverse" : ""}`}>
				<div className="min-w-0">
					<div className="truncate text-[9px] font-black uppercase tracking-[0.24em] text-[var(--overlay-primary)]">{data.riotId}</div>
					{config.showRank ? <div className="mt-1 text-3xl font-black uppercase tracking-tight">{data.rank?.label ?? "Unranked"}</div> : null}
					{config.showQueue ? <QueueBadge data={data} className="mt-1.5" /> : null}
				</div>
				{config.showRank && data.rank ? <div className="pb-0.5 font-mono text-xl font-black text-[var(--overlay-highlight)]">{data.rank.leaguePoints} LP</div> : null}
			</div>

			<div className={`mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono font-black ${config.flip ? "justify-end" : ""}`}>
				<div>
					<span className="text-[var(--overlay-primary)]">{data.sessionWins}W</span>
					<span className="mx-1.5 opacity-50">/</span>
					<span className="text-rose-300">{data.sessionLosses}L</span>
				</div>
				{config.showLp ? (
					<div className={!data.lpDeltaAvailable ? "opacity-45" : data.lpDelta > 0 ? "text-emerald-300" : data.lpDelta < 0 ? "text-rose-300" : "opacity-70"}>
						{sessionLpLabel(data)}
					</div>
				) : null}
				{config.showWinRate ? <div className="opacity-80">{sessionWinRate(data)}% Session-WR</div> : null}
				{data.leagueLive ? <div className="text-[var(--overlay-secondary)]">{duration(data.streamStartedAt, clock)}</div> : null}
			</div>

			{config.showGoal && data.rank ? (
				<div className="mt-3 w-80">
					<Progress rank={data.rank} config={config} apexGoals={data.apexGoals} />
				</div>
			) : null}
			{config.showHistory ? <FloatingHistory games={data.games} rows={config.historyRows} config={config} className="mt-4" /> : null}
			{config.showLiveGame && data.liveGame ? <FloatingLiveGame data={data.liveGame} showQueue={config.showQueue} clock={clock} /> : null}
			{config.showStreamerParticipants && !config.showLiveGame && data.liveGame ? <StreamerParticipants data={data.liveGame} floating /> : null}
		</div>
	);
}

function LastGameOverlay({ game, data, config, style }: { game: CommunityObsGame; data: CommunityObsSnapshot; config: CommunityOverlayConfig; style: CSSProperties }) {
	if (config.style === "floating") {
		return (
			<div
				style={style}
				className={`w-[620px] bg-transparent p-5 text-[var(--overlay-text)] [text-shadow:0_2px_9px_rgba(0,0,0,0.98),0_1px_2px_rgba(0,0,0,1)] ${config.flip ? "ml-auto" : ""}`}
			>
				<LastGameContent game={game} data={data} config={config} floating />
			</div>
		);
	}

	if (config.style === "rail") {
		return (
			<div className="p-4">
				<Frame config={config} style={{ ...style, borderColor: "var(--overlay-border)" }} className="w-[328px] rounded-[1.8rem] p-4">
					<LastGameContent game={game} data={data} config={config} rail />
				</Frame>
			</div>
		);
	}

	const width = config.style === "compact" ? "w-[490px]" : config.style === "session" ? "w-[820px]" : config.style === "banner" ? "w-[1180px]" : "w-[760px]";
	const padding = config.style === "banner" || config.style === "compact" ? "p-3" : "p-4";
	return (
		<div className={padding}>
			<Frame
				config={config}
				style={{ ...style, borderColor: "var(--overlay-border)" }}
				className={`${width} rounded-[1.7rem] ${config.style === "compact" ? "px-4 py-3" : "p-5"}`}
			>
				<LastGameContent game={game} data={data} config={config} compact={config.style === "compact"} banner={config.style === "banner"} />
			</Frame>
		</div>
	);
}

function LastGameContent({
	game,
	data,
	config,
	compact = false,
	banner = false,
	rail = false,
	floating = false,
}: {
	game: CommunityObsGame;
	data: CommunityObsSnapshot;
	config: CommunityOverlayConfig;
	compact?: boolean;
	banner?: boolean;
	rail?: boolean;
	floating?: boolean;
}) {
	const resultTone = game.win ? "text-emerald-300" : "text-rose-300";
	const resultSurface = game.win ? "border-emerald-300/60 bg-emerald-400/15 shadow-emerald-400/15" : "border-rose-300/60 bg-rose-400/15 shadow-rose-400/15";
	const heroSize = compact ? "h-24 w-28" : banner ? "h-28 w-48" : "size-36";
	const hero = (
		<div className={`relative shrink-0 overflow-hidden rounded-2xl border shadow-xl shadow-black/45 ${resultSurface} ${heroSize}`}>
			{/* OBS needs direct access to Riot's CDN image. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
			<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-black/15" />
			<div
				className={`absolute top-2 rounded-full border px-2 py-1 text-[7px] font-black uppercase tracking-[0.16em] backdrop-blur-md ${config.flip ? "left-2" : "right-2"} ${resultSurface} ${resultTone}`}
			>
				{game.win ? "Sieg" : "Niederlage"}
			</div>
			<div className={`absolute inset-x-0 bottom-0 px-3 pb-2.5 ${config.flip ? "text-right" : ""}`}>
				<div className={`${compact ? "text-base" : "text-xl"} truncate font-black tracking-tight text-white`}>{game.championName}</div>
			</div>
			<div className={`absolute inset-y-0 w-1.5 ${config.flip ? "right-0" : "left-0"} ${game.win ? "bg-emerald-300" : "bg-rose-400"}`} />
		</div>
	);
	const details = (
		<div className={`min-w-0 flex-1 ${config.flip ? "text-right" : ""}`}>
			<div className={`flex flex-wrap items-start justify-between gap-2 ${config.flip ? "flex-row-reverse" : ""}`}>
				<div>
					<div className={`text-[8px] font-black uppercase tracking-[0.22em] ${resultTone}`}>Letzte Partie</div>
					<div className={`${compact ? "text-lg" : "text-2xl"} mt-0.5 font-black tracking-tight`}>{game.kda} KDA</div>
				</div>
				{config.showQueue ? <QueueBadge label={data.rank?.queueLabel ?? "Ranked"} /> : null}
			</div>
			<div className={`mt-3 grid ${compact ? "grid-cols-3" : "grid-cols-4"} gap-2`}>
				<LastGameStat label="KDA" value={game.kda} />
				<LastGameStat label="CS" value={String(game.creepScore)} />
				{compact ? null : <LastGameStat label="Gold" value={`${(game.goldEarned / 1000).toFixed(1)}k`} />}
				<LastGameStat label="Dauer" value={formatSeconds(game.durationSeconds)} />
			</div>
			<div className={`mt-3 flex flex-wrap gap-1.5 ${config.flip ? "flex-row-reverse justify-end" : ""}`}>
				{game.items.map((item, index) => (
					<div
						key={`${item.id}-${index}`}
						className={`${compact ? "size-7" : "size-9"} overflow-hidden rounded-lg border border-white/20 bg-black/30 shadow-md shadow-black/50`}
					>
						{/* OBS needs direct access to Riot's CDN image. */}
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
					</div>
				))}
			</div>
		</div>
	);

	if (rail) {
		return (
			<div className={config.flip ? "text-right" : ""}>
				<div className={`relative h-44 overflow-hidden rounded-2xl border shadow-xl shadow-black/45 ${resultSurface}`}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
					<div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-transparent" />
					<div
						className={`absolute top-3 rounded-full border px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.16em] backdrop-blur-md ${config.flip ? "left-3" : "right-3"} ${resultSurface} ${resultTone}`}
					>
						{game.win ? "Sieg" : "Niederlage"}
					</div>
					<div className={`absolute inset-x-0 bottom-0 p-3.5 ${config.flip ? "text-right" : ""}`}>
						<div className="text-[7px] font-black uppercase tracking-[0.2em] text-white/55">Letzte Partie</div>
						<div className="mt-0.5 truncate text-2xl font-black text-white">{game.championName}</div>
					</div>
				</div>
				{config.showQueue ? (
					<div className={`mt-2 flex ${config.flip ? "justify-end" : ""}`}>
						<QueueBadge label={data.rank?.queueLabel ?? "Ranked"} />
					</div>
				) : null}
				<div className="mt-3 grid grid-cols-2 gap-2">
					<LastGameStat label="KDA" value={game.kda} />
					<LastGameStat label="CS" value={String(game.creepScore)} />
					<LastGameStat label="Gold" value={`${(game.goldEarned / 1000).toFixed(1)}k`} />
					<LastGameStat label="Dauer" value={formatSeconds(game.durationSeconds)} />
				</div>
				<div className={`mt-3 flex flex-wrap gap-1.5 ${config.flip ? "flex-row-reverse justify-end" : ""}`}>
					{game.items.map((item, index) => (
						<div key={`${item.id}-${index}`} className="size-9 overflow-hidden rounded-lg border border-white/20 bg-black/30 shadow-md shadow-black/50">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
						</div>
					))}
				</div>
			</div>
		);
	}
	if (banner) {
		return (
			<div className={`flex items-center gap-4 ${config.flip ? "flex-row-reverse" : ""}`}>
				{hero}
				{details}
			</div>
		);
	}
	return (
		<div className={`flex items-stretch gap-4 ${config.flip && !floating ? "flex-row-reverse" : ""}`}>
			{hero}
			{details}
		</div>
	);
}

function LastGameStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
			<div className="text-[6px] font-black uppercase tracking-[0.16em] opacity-40">{label}</div>
			<div className="mt-1 truncate font-mono text-xs font-black">{value}</div>
		</div>
	);
}

const FREEFORM_LABELS: Record<FreeformElementType, string> = {
	identity: "Spieler",
	rank: "Rang",
	session: "Session",
	goal: "Rangziel",
	history: "Matchhistorie",
	liveGame: "Live-Spiel",
};

type FreeformInteraction = {
	type: FreeformElementType;
	kind: "move" | "resize";
	pointerId: number;
	startX: number;
	startY: number;
	start: FreeformOverlayElement;
};

function FreeformOverlay({
	data,
	config,
	style,
	clock,
	editor,
	editorOptions,
}: OverlayProps & { editor: boolean; editorOptions: { grid: boolean; snap: boolean; safeArea: boolean } }) {
	const [layout, setLayout] = useState(() => config.freeformLayout.map((element) => ({ ...element })));
	const [selected, setSelected] = useState<FreeformElementType | null>(config.freeformLayout[0]?.type ?? null);
	const interaction = useRef<FreeformInteraction | null>(null);

	function notifySelection(type: FreeformElementType) {
		setSelected(type);
		if (editor) window.parent.postMessage({ type: "community-overlay-element-selected", elementType: type }, window.location.origin);
	}

	function notifyLayout(next: FreeformOverlayElement[]) {
		if (!editor) return;
		const active = selected ? next.find((element) => element.type === selected) : null;
		const ordered = active ? [active, ...next.filter((element) => element.type !== active.type)] : next;
		window.parent.postMessage({ type: "community-overlay-layout", layout: ordered }, window.location.origin);
	}

	function updateElement(type: FreeformElementType, change: Partial<FreeformOverlayElement>, commit = false) {
		setLayout((current) => {
			const next = current.map((element) => (element.type === type ? { ...element, ...change } : element));
			if (commit) notifyLayout(next);
			return next;
		});
	}

	function startInteraction(event: PointerEvent<HTMLElement>, element: FreeformOverlayElement, kind: "move" | "resize") {
		if (!editor || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		notifySelection(element.type);
		event.currentTarget.setPointerCapture(event.pointerId);
		interaction.current = { type: element.type, kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: { ...element } };
	}

	function moveInteraction(event: PointerEvent<HTMLElement>) {
		const active = interaction.current;
		if (!active || active.pointerId !== event.pointerId) return;
		const dx = event.clientX - active.startX;
		const dy = event.clientY - active.startY;
		if (active.kind === "move") {
			const grid = editorOptions.snap ? 20 : 1;
			updateElement(active.type, {
				x: clamp(Math.round((active.start.x + dx) / grid) * grid, 0, FREEFORM_CANVAS.width - active.start.width),
				y: clamp(Math.round((active.start.y + dy) / grid) * grid, 0, FREEFORM_CANVAS.height - active.start.height),
			});
			return;
		}
		const grid = editorOptions.snap ? 20 : 1;
		updateElement(active.type, {
			width: clamp(Math.round((active.start.width + dx) / grid) * grid, 150, FREEFORM_CANVAS.width - active.start.x),
			height: clamp(Math.round((active.start.height + dy) / grid) * grid, 72, FREEFORM_CANVAS.height - active.start.y),
		});
	}

	function finishInteraction(event: PointerEvent<HTMLElement>) {
		const active = interaction.current;
		if (!active || active.pointerId !== event.pointerId) return;
		interaction.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		setLayout((current) => {
			notifyLayout(current);
			return current;
		});
	}

	function moveWithKeyboard(event: KeyboardEvent<HTMLElement>, element: FreeformOverlayElement) {
		if (!editor || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
		event.preventDefault();
		const distance = event.shiftKey ? 10 : 1;
		const dx = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
		const dy = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
		updateElement(
			element.type,
			{
				x: clamp(element.x + dx, 0, FREEFORM_CANVAS.width - element.width),
				y: clamp(element.y + dy, 0, FREEFORM_CANVAS.height - element.height),
			},
			true
		);
	}

	return (
		<div
			style={style}
			className={`relative h-[720px] w-[1280px] overflow-hidden text-[var(--overlay-text)] ${editor && editorOptions.grid ? "bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:20px_20px]" : ""}`}
		>
			{editor && editorOptions.safeArea ? (
				<div aria-hidden className="pointer-events-none absolute inset-8 z-[100] rounded-2xl border border-dashed border-amber-200/28" />
			) : null}
			{layout.map((element) => {
				const elementStyle = {
					left: element.x,
					top: element.y,
					width: element.width,
					height: element.height,
					zIndex: element.zIndex,
					"--overlay-text": element.textColor || config.text,
					"--overlay-primary": element.accentColor || config.primary,
					"--overlay-secondary": config.secondary,
					"--overlay-highlight": config.highlight,
					"--overlay-background": element.showBackground ? withOpacity(element.backgroundColor || config.background, element.backgroundOpacity) : "transparent",
					"--overlay-border": element.showBorder ? element.borderColor || config.border : "transparent",
					touchAction: "none",
				} as CSSProperties;
				return (
					<section
						key={element.type}
						style={elementStyle}
						tabIndex={editor ? 0 : -1}
						aria-label={`${FREEFORM_LABELS[element.type]} verschieben`}
						onPointerDown={(event) => startInteraction(event, element, "move")}
						onPointerMove={moveInteraction}
						onPointerUp={finishInteraction}
						onPointerCancel={finishInteraction}
						onKeyDown={(event) => moveWithKeyboard(event, element)}
						onFocus={() => notifySelection(element.type)}
						className={`absolute overflow-hidden rounded-2xl text-[var(--overlay-text)] outline-none ${element.showBackground ? "bg-[var(--overlay-background)] shadow-2xl shadow-black/35 backdrop-blur-xl" : "bg-transparent"} ${element.showBorder ? "border border-[var(--overlay-border)]" : ""} ${editor ? "cursor-move select-none" : ""} ${editor && selected === element.type ? "ring-2 ring-cyan-200 ring-offset-2 ring-offset-[#06110b]" : editor ? "ring-1 ring-white/15" : ""}`}
					>
						{editor ? (
							<div className="pointer-events-none absolute right-2 top-2 z-20 rounded-md bg-black/75 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-cyan-50">
								{FREEFORM_LABELS[element.type]}
							</div>
						) : null}
						<FreeformElementContent type={element.type} data={data} config={config} clock={clock} />
						{editor ? (
							<button
								type="button"
								aria-label={`${FREEFORM_LABELS[element.type]} skalieren`}
								onPointerDown={(event) => startInteraction(event, element, "resize")}
								onPointerMove={moveInteraction}
								onPointerUp={finishInteraction}
								onPointerCancel={finishInteraction}
								className="absolute bottom-1 right-1 z-30 size-5 cursor-nwse-resize rounded-md border border-cyan-100/60 bg-cyan-200/25 shadow-lg shadow-black/60 after:absolute after:bottom-1 after:right-1 after:size-1.5 after:border-b-2 after:border-r-2 after:border-cyan-50"
							/>
						) : null}
					</section>
				);
			})}
		</div>
	);
}

function FreeformElementContent({ type, data, config, clock }: { type: FreeformElementType; data: CommunityObsSnapshot; config: CommunityOverlayConfig; clock: number }) {
	if (type === "identity") {
		return (
			<div className="flex h-full items-center justify-between gap-4 px-5 py-4">
				<div className="min-w-0">
					<div className="text-[8px] font-black uppercase tracking-[0.26em] text-[var(--overlay-primary)]">League Performance</div>
					<div className="mt-1 truncate text-2xl font-black tracking-tight">{data.riotId}</div>
				</div>
				{data.leagueLive ? (
					<div className="shrink-0 font-mono text-sm font-black tabular-nums text-[var(--overlay-highlight)]">{duration(data.streamStartedAt, clock)}</div>
				) : null}
			</div>
		);
	}
	if (type === "rank") {
		return (
			<div className="flex h-full flex-col justify-end p-5">
				<div className="text-[8px] font-black uppercase tracking-[0.22em] opacity-45">{rankQueueLabel(data)}</div>
				<div className="mt-2 truncate text-3xl font-black tracking-tight">{data.rank?.label ?? "Unranked"}</div>
				<div className="mt-1 font-mono text-lg font-black text-[var(--overlay-highlight)]">{data.rank ? `${data.rank.leaguePoints} LP` : "Keine Wertung"}</div>
			</div>
		);
	}
	if (type === "session") {
		return (
			<div className="grid h-full grid-cols-2 content-end gap-2 p-4">
				<div className="col-span-2 mb-1 text-[8px] font-black uppercase tracking-[0.24em] text-[var(--overlay-primary)]">Aktuelle Session</div>
				<RailStat label="Bilanz" value={`${data.sessionWins}W · ${data.sessionLosses}L`} />
				<RailStat label="Winrate" value={`${sessionWinRate(data)}%`} />
				<RailStat label="LP-Delta" value={sessionLpLabel(data)} tone={sessionLpTone(data)} />
				<RailStat label="Spiele" value={String(data.sessionWins + data.sessionLosses)} />
			</div>
		);
	}
	if (type === "goal") {
		return (
			<div className="flex h-full flex-col justify-end p-5">
				<div className="mb-3 text-[8px] font-black uppercase tracking-[0.24em] text-[var(--overlay-primary)]">Rangziel</div>
				{data.rank ? <Progress rank={data.rank} config={config} apexGoals={data.apexGoals} /> : <div className="text-sm font-black opacity-45">Keine Rangdaten</div>}
			</div>
		);
	}
	if (type === "history") {
		return (
			<div className="flex h-full flex-col p-4">
				<div className="mb-3 text-[8px] font-black uppercase tracking-[0.24em] text-[var(--overlay-primary)]">Letzte Spiele</div>
				<FreeformHistory games={data.games} rows={config.historyRows} config={config} />
			</div>
		);
	}
	return (
		<div className="h-full p-4">
			<div className="mb-3 text-[8px] font-black uppercase tracking-[0.24em] text-[var(--overlay-primary)]">Aktuelles Spiel</div>
			{data.liveGame ? (
				<>
					<div className="flex items-center justify-between gap-3">
						<div className="font-mono text-sm font-black tabular-nums text-[var(--overlay-highlight)]">{liveGameDuration(data.liveGame, clock)}</div>
						{config.showQueue ? <QueueBadge label={data.liveGame.queueLabel} live /> : null}
					</div>
					<LiveGameGrid data={data.liveGame} className="mt-3" />
				</>
			) : (
				<div className="grid h-[calc(100%-2rem)] place-items-center rounded-xl border border-dashed border-white/10 text-center text-[10px] font-black uppercase tracking-[0.16em] opacity-35">
					Kein aktives Spiel
				</div>
			)}
		</div>
	);
}

function FreeformHistory({ games, rows, config }: { games: CommunityObsGame[]; rows: number; config: CommunityOverlayConfig }) {
	const visible = games.slice(0, rows * 5);
	if (!visible.length)
		return (
			<div className="grid flex-1 place-items-center rounded-xl border border-dashed border-white/10 text-[9px] font-black uppercase tracking-[0.15em] opacity-35">
				Noch keine Session-Games
			</div>
		);
	return (
		<div className="grid min-h-0 flex-1 grid-cols-5 gap-2" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
			{visible.map((game) => (
				<div
					key={game.matchId}
					className={`relative min-h-0 overflow-hidden rounded-xl border ${game.win ? "border-emerald-300/55 bg-emerald-400/15" : "border-rose-300/55 bg-rose-400/15"}`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className="h-full w-full object-cover" />
					<div
						className={`absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t ${game.win ? "from-emerald-950" : "from-rose-950"} via-black/75 to-transparent px-2 pb-1.5 pt-5`}
					>
						<span className="truncate text-[8px] font-black">{game.championName}</span>
						{config.showBadges && game.badge ? <span className="shrink-0 text-[7px] font-black text-[var(--overlay-highlight)]">{game.badge}</span> : null}
					</div>
				</div>
			))}
		</div>
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

type OverlayProps = { data: CommunityObsSnapshot; config: CommunityOverlayConfig; style: CSSProperties; clock: number };

function Header({ data, config, clock, compact = false }: { data: CommunityObsSnapshot; config: CommunityOverlayConfig; clock: number; compact?: boolean }) {
	return (
		<div className={`flex min-w-0 items-center justify-between gap-4 ${compact ? "flex-1" : ""}`}>
			<div className="min-w-0">
				<div className="text-[9px] font-black uppercase tracking-[0.26em] text-[var(--overlay-primary)]">League Performance</div>
				<div className={`${compact ? "text-xl" : "text-2xl"} mt-1 truncate font-black tracking-tight`}>{data.riotId}</div>
				{config.showQueue ? <QueueBadge data={data} className="mt-1.5" /> : null}
			</div>
			{data.leagueLive ? (
				<div className="shrink-0 rounded-xl border border-[var(--overlay-highlight)]/30 bg-black/20 px-3 py-2 text-right">
					<div className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--overlay-highlight)]">Live-Session</div>
					<div className="mt-0.5 font-mono text-sm font-black tabular-nums">{duration(data.streamStartedAt, clock)}</div>
				</div>
			) : config.streamer ? (
				<div className="text-[9px] font-black uppercase tracking-[0.18em] opacity-45">Offline</div>
			) : null}
		</div>
	);
}

function RankPanel({ data, config }: { data: CommunityObsSnapshot; config: CommunityOverlayConfig }) {
	return (
		<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
			<div className="text-[9px] font-black uppercase tracking-[0.22em] opacity-45">{rankQueueLabel(data)}</div>
			{config.showRank ? (
				<>
					<div className="mt-2 text-2xl font-black">{data.rank?.label ?? "Unranked"}</div>
					<div className="mt-1 text-sm font-black text-[var(--overlay-highlight)]">{data.rank ? `${data.rank.leaguePoints} LP` : "Keine Wertung"}</div>
				</>
			) : null}
			{config.showGoal && data.rank ? <Progress rank={data.rank} config={config} apexGoals={data.apexGoals} className="mt-4" /> : null}
		</div>
	);
}

function SessionStats({ data, config }: { data: CommunityObsSnapshot; config: CommunityOverlayConfig }) {
	return (
		<div className="grid grid-cols-3 gap-2">
			<MiniStat label="Session" value={`${data.sessionWins}W · ${data.sessionLosses}L`} />
			{config.showWinRate ? <MiniStat label="Session-WR" value={`${sessionWinRate(data)}%`} /> : <MiniStat label="Ranked" value={`${data.rank?.wins ?? 0}W`} />}
			{config.showLp ? <MiniStat label="LP-Delta" value={sessionLpLabel(data)} tone={sessionLpTone(data)} /> : <MiniStat label="Spiele" value={String(data.games.length)} />}
		</div>
	);
}

const GOAL_TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const GOAL_TIER_LABELS: Record<(typeof GOAL_TIER_ORDER)[number], string> = {
	IRON: "Eisen",
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

function tierGoalLabel(tier: (typeof GOAL_TIER_ORDER)[number]) {
	return GOAL_TIER_ORDER.indexOf(tier) >= GOAL_TIER_ORDER.indexOf("MASTER") ? GOAL_TIER_LABELS[tier] : `${GOAL_TIER_LABELS[tier]} IV · 0 LP`;
}

function goalProgress(rank: NonNullable<CommunityObsSnapshot["rank"]>, config: CommunityOverlayConfig, apexGoals: CommunityObsSnapshot["apexGoals"]) {
	const currentTierIndex = Math.max(0, GOAL_TIER_ORDER.indexOf(rank.tier.toUpperCase() as (typeof GOAL_TIER_ORDER)[number]));
	const currentTier = GOAL_TIER_ORDER[currentTierIndex];
	const masterTierIndex = GOAL_TIER_ORDER.indexOf("MASTER");
	const masterScore = masterTierIndex * 400;
	const isApexRank = currentTierIndex >= masterTierIndex;
	const legacyStartLp = config.goalStartScore === null ? rank.leaguePoints : Math.max(0, Math.round(config.goalStartScore - masterScore));
	const startLp = Math.max(0, Math.min(10_000, Math.round(config.goalStartLp ?? legacyStartLp)));

	// Divisions below Master always measure the complete current tier, e.g.
	// Emerald IV 0 LP -> Diamond IV 0 LP. Apex ranks share one LP ladder and
	// therefore use the configurable LP value captured at session start.
	const startScore = isApexRank ? masterScore + startLp : currentTierIndex * 400;
	const startLabel = isApexRank ? `Start · ${startLp} LP` : tierGoalLabel(currentTier);
	const targetForTier = (tier: (typeof GOAL_TIER_ORDER)[number]) => {
		if (tier === "GRANDMASTER") return apexGoals?.grandmasterScore ?? masterScore + 500;
		if (tier === "CHALLENGER") return apexGoals?.challengerScore ?? masterScore + 800;
		return GOAL_TIER_ORDER.indexOf(tier) * 400;
	};
	const progressTo = (targetScore: number, targetTierIndex: number) => {
		if (targetScore <= startScore) return currentTierIndex < targetTierIndex ? 99 : 100;
		const raw = ((rank.score - startScore) / (targetScore - startScore)) * 100;
		return Math.max(1, Math.min(currentTierIndex < targetTierIndex ? 99 : 100, raw));
	};

	if (config.goalTier === "auto") {
		if (currentTierIndex === GOAL_TIER_ORDER.indexOf("CHALLENGER")) {
			const targetScore = apexGoals?.rankOneScore ?? Math.max(rank.score + 1, masterScore + 1200);
			const percent = targetScore <= startScore ? 100 : Math.max(1, Math.min(100, ((rank.score - startScore) / (targetScore - startScore)) * 100));
			return { startLabel, targetLabel: "Rang 1", percent };
		}
		const targetIndex = Math.min(GOAL_TIER_ORDER.length - 1, currentTierIndex + 1);
		const targetTier = GOAL_TIER_ORDER[targetIndex];
		const targetScore = targetForTier(targetTier);
		const percent = progressTo(targetScore, targetIndex);
		const targetLabel = tierGoalLabel(targetTier);
		return { startLabel, targetLabel, percent };
	}
	if (config.goalTier === "RANK_1") {
		const targetScore = apexGoals?.rankOneScore ?? Math.max(rank.score + 1, masterScore + 1200);
		const percent = targetScore <= startScore ? 100 : Math.max(1, Math.min(100, ((rank.score - startScore) / (targetScore - startScore)) * 100));
		return { startLabel, targetLabel: "Rang 1", percent };
	}
	const targetIndex = GOAL_TIER_ORDER.indexOf(config.goalTier);
	const targetScore = targetForTier(config.goalTier);
	const percent = progressTo(targetScore, targetIndex);
	const targetLabel = tierGoalLabel(config.goalTier);
	return { startLabel, targetLabel, percent };
}

function Progress({
	rank,
	config,
	apexGoals,
	className = "",
	flip = false,
}: {
	rank: NonNullable<CommunityObsSnapshot["rank"]>;
	config: CommunityOverlayConfig;
	apexGoals: CommunityObsSnapshot["apexGoals"];
	className?: string;
	flip?: boolean;
}) {
	const goal = goalProgress(rank, config, apexGoals);
	return (
		<div className={className}>
			<div className={`flex justify-between text-[8px] font-black uppercase tracking-[0.14em] opacity-50 ${flip ? "flex-row-reverse" : ""}`}>
				<span>{goal.startLabel}</span>
				<span>{goal.targetLabel}</span>
			</div>
			<div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/35">
				<div
					className={`h-full rounded-full from-[var(--overlay-primary)] to-[var(--overlay-secondary)] transition-[width] duration-700 ${flip ? "ml-auto bg-gradient-to-l" : "bg-gradient-to-r"}`}
					style={{ width: `${goal.percent}%` }}
				/>
			</div>
		</div>
	);
}

function RailProgress({ goal, flip = false }: { goal: ReturnType<typeof goalProgress>; flip?: boolean }) {
	return (
		<div className="flex min-h-64 flex-col items-center text-center">
			<div className="max-w-[4.2rem] text-[7px] font-black uppercase leading-3 tracking-[0.1em] text-[var(--overlay-secondary)]">{goal.targetLabel}</div>
			<div className="relative my-2.5 w-3.5 flex-1 rounded-full bg-black/35 ring-1 ring-white/10">
				<div
					className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-[var(--overlay-primary)] to-[var(--overlay-secondary)] transition-[height] duration-700"
					style={{ height: `${goal.percent}%` }}
				/>
				<div
					className="absolute left-1/2 z-10 size-4 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-[var(--overlay-text)] bg-[var(--overlay-highlight)] shadow-[0_0_14px_var(--overlay-highlight)] transition-[bottom] duration-700"
					style={{ bottom: `${goal.percent}%` }}
				/>
				<div
					className={`absolute -translate-y-1/2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[7px] font-black tabular-nums text-[var(--overlay-text)] ${flip ? "right-6" : "left-6"}`}
					style={{ bottom: `${goal.percent}%` }}
				>
					{Math.round(goal.percent)}%
				</div>
			</div>
			<div className="max-w-[4.2rem] text-[7px] font-black uppercase leading-3 tracking-[0.08em] opacity-55">{goal.startLabel}</div>
		</div>
	);
}

function RailStat({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
	return (
		<div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
			<div className="text-[6px] font-black uppercase tracking-[0.16em] opacity-40">{label}</div>
			<div className={`mt-1 truncate text-xs font-black ${tone > 0 ? "text-emerald-300" : tone < 0 ? "text-rose-300" : ""}`}>{value}</div>
		</div>
	);
}

function RailHistory({ games, rows, config, flip = false }: { games: CommunityObsGame[]; rows: number; config: CommunityOverlayConfig; flip?: boolean }) {
	const visible = games.slice(0, rows * 5);
	return (
		<div className={`mt-3 ${flip ? "text-right" : ""}`}>
			<div className="mb-2 text-[7px] font-black uppercase tracking-[0.2em] opacity-40">Letzte Spiele</div>
			<div className="space-y-2">
				{visible.length ? (
					visible.map((game) => (
						<div
							key={game.matchId}
							className={`flex items-center gap-2 overflow-hidden rounded-xl border ${flip ? "flex-row-reverse pl-2" : "pr-2"} ${game.win ? "border-emerald-300/35 bg-emerald-400/10" : "border-rose-300/35 bg-rose-400/10"}`}
						>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={game.championIconUrl} alt={game.championName} className="size-10 shrink-0 object-cover" />
							<div className="min-w-0 flex-1">
								<div className="truncate text-[9px] font-black">{game.championName}</div>
								<div className="mt-0.5 font-mono text-[7px] font-bold opacity-50">{game.kda}</div>
							</div>
							<div className={`text-[9px] font-black ${game.win ? "text-emerald-300" : "text-rose-300"}`}>{game.win ? "W" : "L"}</div>
							{config.showBadges && game.badge ? <div className="text-[7px] font-black text-[var(--overlay-highlight)]">{game.badge}</div> : null}
						</div>
					))
				) : (
					<div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[8px] font-black uppercase tracking-[0.12em] opacity-35">
						Noch keine Session-Games
					</div>
				)}
			</div>
		</div>
	);
}

function History({
	games,
	rows,
	config,
	compact = false,
	className = "",
}: {
	games: CommunityObsGame[];
	rows: number;
	config: CommunityOverlayConfig;
	compact?: boolean;
	className?: string;
}) {
	const visible = games.slice(0, rows * 5);
	if (!visible.length)
		return (
			<div className={`${className} rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-[9px] font-black uppercase tracking-[0.15em] opacity-35`}>
				Noch keine Session-Games
			</div>
		);
	return (
		<div className={`${className} grid grid-cols-5 gap-2`}>
			{visible.map((game) => (
				<div
					key={game.matchId}
					className={`relative overflow-hidden rounded-xl border ${game.win ? "border-emerald-300/50 bg-emerald-400/15" : "border-rose-300/50 bg-rose-400/15"}`}
				>
					{/* OBS needs the original CDN asset without Next image-proxy overhead. */}
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className={`${compact ? "h-11" : "h-14"} w-full object-cover`} />
					<div className={`absolute inset-x-0 bottom-0 h-1 ${game.win ? "bg-emerald-300" : "bg-rose-400"}`} />
					{config.showBadges && game.badge ? (
						<span className="absolute right-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[7px] font-black text-[var(--overlay-highlight)]">{game.badge}</span>
					) : null}
					{!compact ? <div className="truncate px-1.5 py-1 text-center text-[8px] font-black">{game.kda}</div> : null}
				</div>
			))}
		</div>
	);
}

function FloatingHistory({ games, rows, config, className = "" }: { games: CommunityObsGame[]; rows: number; config: CommunityOverlayConfig; className?: string }) {
	const visible = games.slice(0, rows * 5);
	if (!visible.length) return <div className={`${className} text-xs font-black uppercase tracking-[0.16em] opacity-55`}>Noch keine Session-Games</div>;
	return (
		<div className={`${className} grid w-fit grid-cols-5 gap-2`}>
			{visible.map((game) => (
				<div
					key={game.matchId}
					className={`relative size-14 overflow-hidden rounded-xl border-[3px] ${
						game.win ? "border-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.7)]" : "border-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.68)]"
					}`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={game.championIconUrl} alt={game.championName} className="size-full object-cover" />
					{config.showBadges && game.badge ? (
						<span className="absolute right-0.5 top-0.5 rounded bg-black/80 px-1 py-0.5 text-[6px] font-black text-[var(--overlay-highlight)]">{game.badge}</span>
					) : null}
				</div>
			))}
		</div>
	);
}

function LiveGame({ data, showQueue, clock, compact = false }: { data: NonNullable<CommunityObsSnapshot["liveGame"]>; showQueue: boolean; clock: number; compact?: boolean }) {
	return (
		<div className={`${compact ? "mt-3 rounded-xl px-2.5 py-2" : "mt-4 rounded-2xl p-3"} border border-[var(--overlay-secondary)]/25 bg-black/20`}>
			<div className="flex items-center justify-between gap-3">
				<div className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--overlay-secondary)]">Aktuelles Spiel · {liveGameDuration(data, clock)}</div>
				{showQueue ? <QueueBadge label={data.queueLabel} live /> : null}
			</div>
			<LiveGameGrid data={data} className="mt-2" compact={compact} />
		</div>
	);
}

function FloatingLiveGame({ data, showQueue, clock }: { data: NonNullable<CommunityObsSnapshot["liveGame"]>; showQueue: boolean; clock: number }) {
	return (
		<div className="mt-4 w-[30rem]">
			<div className="flex items-center justify-between gap-3">
				<div className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--overlay-secondary)]">Aktuelles Spiel · {liveGameDuration(data, clock)}</div>
				{showQueue ? <QueueBadge label={data.queueLabel} live /> : null}
			</div>
			<LiveGameGrid data={data} className="mt-2" floating />
		</div>
	);
}

function StreamerParticipants({ data, compact = false, floating = false }: { data: NonNullable<CommunityObsSnapshot["liveGame"]>; compact?: boolean; floating?: boolean }) {
	const streamers = data.participants.filter((participant) => participant.streamer);
	if (streamers.length === 0) return null;

	return (
		<div
			className={`${compact ? "mt-2.5 px-2.5 py-2" : "mt-3 p-3"} ${
				floating
					? "w-fit rounded-2xl border border-[#b784ff]/45 bg-black/45 shadow-[0_0_24px_rgba(145,70,255,0.25)] backdrop-blur-md"
					: "rounded-2xl border border-[#b784ff]/30 bg-[#9146ff]/[0.09]"
			}`}
		>
			<div className="flex items-center gap-2">
				<span className="grid size-5 shrink-0 place-items-center rounded-md bg-[#9146ff] text-white shadow-lg shadow-[#9146ff]/45" aria-hidden="true">
					<svg viewBox="0 0 20 20" className="size-3" fill="currentColor">
						<path d="M4 2h13v10l-4 4H9l-2.5 2.5V16H4V2Zm2 2v10h2.5v1.2L9.7 14H13l2-2V4H6Zm3 2h2v5H9V6Zm4 0h2v5h-2V6Z" />
					</svg>
				</span>
				<span className="text-[7px] font-black uppercase tracking-[0.2em] text-[#d8c2ff]">Streamer im aktuellen Spiel</span>
			</div>
			<div className={`mt-2 flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
				{streamers.map((participant, index) => (
					<div
						key={`${participant.streamer!.login}-${participant.teamId}-${index}`}
						className={`flex items-center overflow-hidden rounded-xl border border-[#b784ff]/35 bg-black/30 ${compact ? "gap-1.5 pr-2" : "gap-2 pr-3"}`}
						title={`${participant.streamer!.displayName} · ${participant.name} · ${LIVE_ROLE_LABELS[participant.role]}`}
					>
						<div className={`relative shrink-0 overflow-hidden ${compact ? "size-7" : "size-9"}`}>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={participant.championIconUrl} alt={participant.name} className="size-full object-cover" />
							<span className="absolute inset-y-0 left-0 w-0.5 bg-[#b784ff]" />
						</div>
						<div className="min-w-0">
							<div className={`${compact ? "max-w-20 text-[7px]" : "max-w-28 text-[9px]"} truncate font-black text-white`}>{participant.streamer!.displayName}</div>
							<div className="text-[6px] font-bold uppercase tracking-[0.1em] text-[#d8c2ff]/55">{LIVE_ROLE_LABELS[participant.role]}</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

const LIVE_ROLE_LABELS: Record<NonNullable<CommunityObsSnapshot["liveGame"]>["participants"][number]["role"], string> = {
	TOP: "Top",
	JUNGLE: "Jungle",
	MIDDLE: "Mid",
	BOTTOM: "Bot",
	UTILITY: "Support",
};

function LiveGameGrid({
	data,
	className = "",
	compact = false,
	floating = false,
}: {
	data: NonNullable<CommunityObsSnapshot["liveGame"]>;
	className?: string;
	compact?: boolean;
	floating?: boolean;
}) {
	return (
		<div className={`${className} grid grid-cols-10 ${compact ? "gap-1" : "gap-1.5"}`}>
			{data.participants.map((participant, index) => (
				<div
					key={`${participant.name}-${participant.teamId}-${participant.role}-${index}`}
					className={`relative overflow-hidden rounded-lg border transition ${floating ? "border-2 shadow-lg shadow-black/70" : ""} ${
						participant.streamer ? "border-[#b784ff] shadow-[0_0_18px_rgba(145,70,255,0.55)]" : participant.teamId === 100 ? "border-sky-300/60" : "border-rose-300/60"
					} ${participant.isTrackedPlayer ? "ring-2 ring-[var(--overlay-highlight)] ring-offset-1 ring-offset-black/70" : ""}`}
					title={`${participant.streamer ? `${participant.streamer.displayName} auf Twitch · ` : ""}${participant.name} · ${LIVE_ROLE_LABELS[participant.role]} (geschätzt)`}
				>
					{/* OBS needs direct access to Riot's CDN image. */}
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={participant.championIconUrl} alt={participant.name} className="aspect-square w-full object-cover" />
					{participant.streamer ? (
						<>
							<span
								className="absolute left-0.5 top-0.5 grid size-4 place-items-center rounded bg-[#9146ff] text-white shadow-lg shadow-[#9146ff]/50"
								aria-hidden="true"
							>
								<svg viewBox="0 0 20 20" className="size-2.5" fill="currentColor">
									<path d="M4 2h13v10l-4 4H9l-2.5 2.5V16H4V2Zm2 2v10h2.5v1.2L9.7 14H13l2-2V4H6Zm3 2h2v5H9V6Zm4 0h2v5h-2V6Z" />
								</svg>
							</span>
							<span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-r from-[#6f2bd3]/95 to-[#9146ff]/90 px-1 py-0.5 text-center text-[5px] font-black uppercase tracking-[0.02em] text-white">
								{participant.streamer.displayName}
							</span>
						</>
					) : null}
					<RoleIcon role={participant.role} position={participant.streamer ? "top" : "bottom"} />
				</div>
			))}
		</div>
	);
}

function RoleIcon({ role, position = "bottom" }: { role: keyof typeof LIVE_ROLE_LABELS; position?: "top" | "bottom" }) {
	return (
		<span
			className={`absolute right-0.5 grid size-4 place-items-center rounded bg-black/85 text-white shadow-md ${position === "top" ? "top-0.5" : "bottom-0.5"}`}
			title={LIVE_ROLE_LABELS[role]}
		>
			<svg viewBox="0 0 20 20" className="size-3" aria-hidden="true">
				{role === "TOP" ? <path d="M3 3h14v3H6v11H3V3Z" fill="currentColor" /> : null}
				{role === "JUNGLE" ? <path d="M10 17c-1-4-3-6-7-8 4 0 6 1 7 3 1-4 3-7 7-9-1 5-3 9-7 14Z" fill="currentColor" /> : null}
				{role === "MIDDLE" ? <path d="m3 14 11-11 3 3L6 17H3v-3Z" fill="currentColor" /> : null}
				{role === "BOTTOM" ? <path d="M14 3h3v14H3v-3h11V3Z" fill="currentColor" /> : null}
				{role === "UTILITY" ? <path d="M10 2 7.8 7.2 2 10l5.8 2.8L10 18l2.2-5.2L18 10l-5.8-2.8L10 2Z" fill="currentColor" /> : null}
			</svg>
		</span>
	);
}

function QueueBadge({ data, label, live = false, className = "" }: { data?: CommunityObsSnapshot; label?: string; live?: boolean; className?: string }) {
	const resolvedLabel = label ?? data?.liveGame?.queueLabel ?? data?.rank?.queueLabel;
	if (!resolvedLabel) return null;
	const isLiveQueue = live || Boolean(data?.liveGame);
	return (
		<span
			className={`${className} inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.15em] ${isLiveQueue ? "border-cyan-200/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.04] opacity-55"}`}
		>
			{isLiveQueue ? <span className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_8px_rgba(165,243,252,0.9)]" /> : null}
			{resolvedLabel}
		</span>
	);
}

function rankQueueLabel(data: CommunityObsSnapshot) {
	if (data.rank?.queueLabel) return data.rank.queueLabel;
	if (data.liveGame?.queueId === 420 || data.liveGame?.queueId === 440) return data.liveGame.queueLabel;
	return "Ranked";
}

function MiniStat({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
	return (
		<div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
			<div className="text-[7px] font-black uppercase tracking-[0.18em] opacity-40">{label}</div>
			<div className={`mt-1 truncate text-sm font-black ${tone > 0 ? "text-emerald-300" : tone < 0 ? "text-rose-300" : ""}`}>{value}</div>
		</div>
	);
}

function HeroStat({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
	return (
		<div className="shrink-0 text-center">
			<div className="text-[8px] font-black uppercase tracking-[0.18em] opacity-40">{label}</div>
			<div className={`mt-1 text-lg font-black ${tone > 0 ? "text-emerald-300" : tone < 0 ? "text-rose-300" : ""}`}>{value}</div>
		</div>
	);
}

function OverlayNotice({ text }: { text: string }) {
	return <div className="m-4 inline-flex rounded-2xl border border-white/10 bg-black/70 px-5 py-4 text-sm font-bold text-white/70 backdrop-blur-xl">{text}</div>;
}

function withOpacity(hex: string, opacity: number) {
	const value = hex.replace("#", "");
	const red = Number.parseInt(value.slice(0, 2), 16);
	const green = Number.parseInt(value.slice(2, 4), 16);
	const blue = Number.parseInt(value.slice(4, 6), 16);
	return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`;
}

function signed(value: number, suffix = "") {
	return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function sessionWinRate(data: CommunityObsSnapshot) {
	const games = data.sessionWins + data.sessionLosses;
	return games > 0 ? Math.round((data.sessionWins / games) * 100) : 0;
}

function sessionLpLabel(data: CommunityObsSnapshot, includeUnit = true) {
	if (!data.lpDeltaAvailable) return "–";
	return signed(data.lpDelta, includeUnit ? " LP" : "");
}

function sessionLpTone(data: CommunityObsSnapshot) {
	return data.lpDeltaAvailable ? data.lpDelta : 0;
}

function duration(startedAt: string | null, now: number) {
	if (!startedAt) return "00:00:00";
	return formatSeconds(Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)));
}

function liveGameDuration(game: NonNullable<CommunityObsSnapshot["liveGame"]>, now: number) {
	const observedAt = new Date(game.observedAt).getTime();
	const elapsedSinceSnapshot = Number.isFinite(observedAt) ? Math.max(0, Math.floor((now - observedAt) / 1000)) : 0;
	return formatSeconds(game.gameLength + elapsedSinceSnapshot);
}

function formatSeconds(seconds: number) {
	const safe = Math.max(0, seconds);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const rest = Math.floor(safe % 60);
	return hours > 0
		? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
		: `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
