import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { LiveBadge } from "@/components/obs/shared/LiveBadge";
import { RankProgress } from "@/components/obs/shared/RankProgress";
import { formatDuration, rankLabel } from "@/components/obs/shared/utils";

export function LauchgruenOverlay({
	data,
	pulseKey,
	displayDurationSeconds,
	title,
	rankProgress,
	lpTone,
}: {
	data: LauchgruenObsResponse;
	pulseKey: number;
	displayDurationSeconds: number;
	title: string;
	rankProgress: number;
	lpTone: string;
}) {
	const gamesPlayed = data.sessionWins + data.sessionLosses;
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
						<RankProgress rank={data.rank} progress={rankProgress} />
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
						<StatCard label="Heute LP" value={`${data.lpDelta > 0 ? "+" : ""}${data.lpDelta}`} valueClassName={lpTone} />
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
				<style>{`@keyframes obs-rank-pulse { 0% { transform: scale(1); } 28% { transform: scale(1.012); box-shadow: 0 0 0 5px rgba(190,242,100,.14); } 100% { transform: scale(1); } } .obs-performance-card { animation: obs-rank-pulse 700ms ease-out; }`}</style>
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
