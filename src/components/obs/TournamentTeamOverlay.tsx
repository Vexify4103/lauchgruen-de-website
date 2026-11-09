"use client";

import { useEffect, useRef, useState } from "react";
import type { ObsTeamResponse, OverlayMatch } from "@/app/api/tournament/obs/route";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";

const POLL_INTERVAL_MS = 10_000;

export function TournamentTeamOverlay({ initial, teamId }: { initial: ObsTeamResponse; teamId: string }) {
	const [data, setData] = useState(initial);
	const [pulseKey, setPulseKey] = useState(0);
	const lastSignatureRef = useRef(signature(initial));

	useEffect(() => {
		let cancelled = false;
		const tick = async () => {
			try {
				const response = await fetch(`/api/tournament/obs?team=${encodeURIComponent(teamId)}`, { cache: "no-store" });
				if (!response.ok) return;
				const json = (await response.json()) as ObsTeamResponse;
				if (cancelled) return;
				const next = signature(json);
				if (next !== lastSignatureRef.current) {
					lastSignatureRef.current = next;
					setPulseKey((k) => k + 1);
				}
				setData(json);
			} catch {
				// Silent retry next interval
			}
		};
		const timer = setInterval(tick, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [teamId]);

	const focus = data.currentMatch ?? data.nextMatch ?? data.recentResult;
	const showLive = data.currentMatch !== null;

	if (data.stage) return <FlexibleTeamCard data={data} focus={focus} live={showLive} pulseKey={pulseKey} />;

	return (
		<div className="flex min-h-screen items-start justify-start p-4">
			<div
				key={pulseKey}
				className="animate-overlay-pop relative w-[28rem] overflow-hidden rounded-2xl border border-white/12 bg-black/72 shadow-2xl shadow-black/60 backdrop-blur-xl"
			>
				<div aria-hidden className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${data.team.accent}`} />

				<div className="flex items-center justify-between gap-3 px-5 pt-4">
					<div className="min-w-0">
						<div className="truncate text-xl font-black tracking-tight text-emerald-50">{data.team.name}</div>
						<div className="mt-0.5 text-[11px] font-black uppercase tracking-[0.22em] text-lime-200/68">
							Gruppe {data.team.group}
							{data.standing.played > 0 ? (
								<>
									{" · "}
									Platz {data.standing.rank}/{data.groupSize}
								</>
							) : null}
							{data.playoffSlot ? (
								<>
									{" · "}
									<span className="text-amber-200">{data.playoffSlot}</span>
								</>
							) : null}
						</div>
					</div>
					<RecordBadge wins={data.standing.wins} losses={data.standing.losses} />
				</div>

				<div className="mt-3 border-t border-white/8 px-5 py-3">
					{focus ? <FocusRow match={focus} live={showLive} /> : <div className="py-1 text-sm font-bold text-emerald-100/52">Keine ausstehenden Spiele.</div>}
				</div>

				<div className="flex items-center justify-between gap-2 border-t border-white/6 bg-black/30 px-5 py-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-100/38">
					<span>lauchgruen cup</span>
					<span className="text-emerald-100/52">
						crafted by <span className="text-lime-200/72">@vexi_fy</span>
					</span>
				</div>
			</div>

			<style>{`
        @keyframes overlay-pop {
          0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
          30%  { transform: scale(1.012); box-shadow: 0 0 0 6px rgba(190, 242, 100, 0.18); }
          100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
        }
        .animate-overlay-pop { animation: overlay-pop 700ms ease-out; }
      `}</style>
		</div>
	);
}

function FocusRow({ match, live }: { match: OverlayMatch; live: boolean }) {
	const hasScore = match.scoreSelf !== undefined && match.scoreOpponent !== undefined;
	const selfWon = hasScore && (match.scoreSelf as number) > (match.scoreOpponent as number);
	const selfLost = hasScore && (match.scoreSelf as number) < (match.scoreOpponent as number);

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0">
				<div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/52">
					{live ? (
						<span className="inline-flex items-center gap-1.5 text-red-300">
							<span className="size-1.5 animate-pulse rounded-full bg-red-400" />
							Live
						</span>
					) : match.status === "Finished" ? (
						<span className={selfWon ? "text-lime-300" : "text-rose-300/70"}>{selfWon ? "Sieg" : selfLost ? "Niederlage" : "Ergebnis"}</span>
					) : (
						<span>Nächstes Spiel</span>
					)}
					<span className="text-emerald-100/40">·</span>
					<span className="truncate">{match.round}</span>
				</div>
				<div className="mt-1.5 truncate text-sm font-black text-emerald-50">vs. {match.opponent}</div>
				{match.poolSelf || match.poolOpponent ? (
					<div className="mt-2 flex flex-wrap gap-1.5">
						{match.poolSelf ? (
							<span className="rounded-md border border-lime-200/20 bg-lime-200/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-lime-100/86">
								Wir: {compactPoolLabel(match.poolSelf)}
							</span>
						) : null}
						{match.poolOpponent ? (
							<span className="rounded-md border border-emerald-100/14 bg-white/[0.045] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/68">
								Gegner: {compactPoolLabel(match.poolOpponent)}
							</span>
						) : null}
					</div>
				) : null}
			</div>

			{hasScore ? (
				<div className="shrink-0 text-right">
					<div className="font-mono text-2xl font-black leading-none">
						<span className={selfWon ? "text-lime-200" : "text-emerald-50"}>{match.scoreSelf}</span>
						<span className="mx-1 text-emerald-100/40">:</span>
						<span className={selfLost ? "text-lime-200" : "text-emerald-50"}>{match.scoreOpponent}</span>
					</div>
				</div>
			) : (
				<div className="shrink-0 text-right text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100/52">{match.time}</div>
			)}
		</div>
	);
}

function RecordBadge({ wins, losses }: { wins: number; losses: number }) {
	return (
		<div className="shrink-0 rounded-xl border border-lime-200/24 bg-lime-200/10 px-3 py-2 text-center">
			<div className="font-mono text-lg font-black leading-none text-lime-50">
				{wins}-{losses}
			</div>
			<div className="mt-1 text-[9px] font-black uppercase tracking-[0.22em] text-lime-200/64">W-L</div>
		</div>
	);
}

/** Swiss/bracket tournaments: stakes, live phase and Fearless locks instead of A-Z groups and pools. */
function FlexibleTeamCard({ data, focus, live, pulseKey }: { data: ObsTeamResponse; focus: OverlayMatch | null; live: boolean; pulseKey: number }) {
	const stage = data.stage!;
	const fearless = data.fearless;
	const out = stage.stakes === "Ausgeschieden";
	return (
		<div className="flex min-h-screen items-start justify-start p-4">
			<div
				key={pulseKey}
				className="animate-overlay-pop relative w-[26rem] overflow-hidden rounded-2xl border border-white/12 bg-[#06110b]/86 text-emerald-50 shadow-2xl shadow-black/60 backdrop-blur-xl"
			>
				<div aria-hidden className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${data.team.accent}`} />

				<div className="flex items-start justify-between gap-4 px-5 pt-4">
					<div className="min-w-0">
						<div className="truncate text-[22px] font-semibold leading-tight tracking-tight">{data.team.name}</div>
						<div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-emerald-100/60">
							<span className="shrink-0">{stage.label}</span>
							{stage.stakes ? (
								<>
									<span aria-hidden className="text-emerald-100/30">·</span>
									<span className={`truncate font-semibold ${out ? "text-rose-200/80" : "text-lime-200"}`}>{stage.stakes}</span>
								</>
							) : null}
						</div>
					</div>
					<div className="shrink-0 text-right">
						<div className="font-mono text-[26px] font-semibold leading-none tabular-nums">
							<span className={data.standing.wins > 0 ? "text-lime-200" : ""}>{data.standing.wins}</span>
							<span className="px-0.5 text-emerald-100/35">–</span>
							<span>{data.standing.losses}</span>
						</div>
						<div className="mt-1 text-[10px] text-emerald-100/45">Bilanz</div>
					</div>
				</div>

				<div className="mt-3 border-t border-white/8 px-5 py-3">
					{focus ? <FlexibleFocusRow match={focus} live={live} /> : <div className="text-sm text-emerald-100/52">Keine ausstehenden Spiele.</div>}
				</div>

				{fearless ? (
					<div className="flex items-center justify-between gap-4 border-t border-white/8 px-5 py-3">
						<div className="shrink-0">
							<div className="font-mono text-[26px] font-semibold leading-none tabular-nums">{fearless.locked}</div>
							<div className="mt-1 text-[10px] text-emerald-100/45">Champions gesperrt</div>
						</div>
						{fearless.lastPicks.length ? (
							<div className="min-w-0 text-right">
								<div className="flex justify-end gap-1">
									{fearless.lastPicks.slice(0, 5).map((pick) => (
										<span key={pick.name} title={pick.name} className="relative size-8 overflow-hidden rounded-md border border-white/12 bg-black/40">
											{pick.image ? (
												// eslint-disable-next-line @next/next/no-img-element -- plain img keeps the OBS source light
												<img src={pick.image} alt={pick.name} width={32} height={32} className="size-full object-cover opacity-60 grayscale" />
											) : null}
										</span>
									))}
								</div>
								<div className="mt-1 truncate text-[10px] text-emerald-100/45">
									Zuletzt gespielt{fearless.lastOpponent ? ` vs ${fearless.lastOpponent}` : ""} · jetzt gesperrt
								</div>
							</div>
						) : (
							<div className="text-right text-[10px] text-emerald-100/45">Noch kein Champion verbraucht</div>
						)}
					</div>
				) : null}

				<div className="flex items-center justify-between gap-2 border-t border-white/6 bg-black/30 px-5 py-1.5 text-[10px] text-emerald-100/40">
					<span>Lauchgruen Cup</span>
					<span>
						crafted by <span className="text-lime-200/72">@vexi_fy</span>
					</span>
				</div>
			</div>
			<style>{`
        @keyframes overlay-pop {
          0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
          30%  { transform: scale(1.012); box-shadow: 0 0 0 6px rgba(190, 242, 100, 0.18); }
          100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(190, 242, 100, 0); }
        }
        .animate-overlay-pop { animation: overlay-pop 700ms ease-out; }
      `}</style>
		</div>
	);
}

function FlexibleFocusRow({ match, live }: { match: OverlayMatch; live: boolean }) {
	const hasScore = match.scoreSelf !== undefined && match.scoreOpponent !== undefined;
	const selfWon = hasScore && (match.scoreSelf as number) > (match.scoreOpponent as number);
	const finished = match.status === "Finished";
	const phase = live ? (match.phase === "draft" ? "Champ Select" : match.phase === "game" ? "Im Spiel" : "Live") : finished ? (selfWon ? "Sieg" : "Niederlage") : "Nächstes Spiel";
	const tone = live ? "text-red-300" : finished ? (selfWon ? "text-lime-300" : "text-rose-300/75") : "text-emerald-100/60";
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0">
				<div className="flex min-w-0 items-center gap-1.5 text-xs">
					<span className={`inline-flex shrink-0 items-center gap-1.5 font-semibold ${tone}`}>
						{live ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-red-400" /> : null}
						{phase}
					</span>
					<span aria-hidden className="text-emerald-100/30">·</span>
					<span className="truncate text-emerald-100/55">{match.round}</span>
				</div>
				<div className="mt-1 truncate text-base font-semibold">
					vs {match.opponent}
					{match.opponentRecord ? <span className="ml-1.5 font-mono text-xs font-normal text-emerald-100/50 tabular-nums">({match.opponentRecord.replace("-", "–")})</span> : null}
				</div>
			</div>
			{hasScore && (finished || (match.scoreSelf ?? 0) + (match.scoreOpponent ?? 0) > 0) ? (
				<div className="shrink-0 font-mono text-2xl font-semibold leading-none tabular-nums">
					<span className={selfWon ? "text-lime-200" : ""}>{match.scoreSelf}</span>
					<span className="mx-1 text-emerald-100/35">:</span>
					<span className={!selfWon && finished ? "text-lime-200" : ""}>{match.scoreOpponent}</span>
				</div>
			) : /d/.test(match.time) ? (
				<div className="shrink-0 text-xs text-emerald-100/55 tabular-nums">{match.time}</div>
			) : null}
		</div>
	);
}

function signature(data: ObsTeamResponse): string {
	return JSON.stringify({
		r: data.standing.rank,
		w: data.standing.wins,
		l: data.standing.losses,
		s: data.stage?.stakes ?? null,
		f: data.fearless?.locked ?? null,
		p: data.currentMatch?.phase ?? null,
		c: data.currentMatch
			? `${data.currentMatch.id}-${data.currentMatch.scoreSelf}-${data.currentMatch.scoreOpponent}-${data.currentMatch.status}-${data.currentMatch.poolSelf}-${data.currentMatch.poolOpponent}`
			: null,
		n: data.nextMatch?.id ?? null,
	});
}
