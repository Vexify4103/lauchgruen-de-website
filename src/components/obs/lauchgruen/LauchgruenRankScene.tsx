import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { RankProgress } from "@/components/obs/shared/RankProgress";
import { queueLabel, rankLabel } from "@/components/obs/shared/utils";

export function LauchgruenRankScene({
	active,
	data,
	gamesPlayed,
	lpDelta,
	lpTone,
	rankProgress,
	title,
}: {
	active: boolean;
	data: LauchgruenObsResponse;
	gamesPlayed: number;
	lpDelta: number;
	lpTone: string;
	rankProgress: number;
	title: string;
}) {
	return (
		<div
			className={`obs-small-scene absolute inset-0 flex h-full flex-col justify-between ${active ? "obs-small-scene-active opacity-100 blur-0" : "pointer-events-none -translate-x-4 opacity-0 blur-md"}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<div className="truncate text-[9px] font-black uppercase tracking-[0.22em] text-emerald-100/56">{title}</div>
						<div className="shrink-0 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-cyan-100">
							{queueLabel(data.rank?.queueType)}
						</div>
					</div>
					<div className="mt-1 flex items-baseline gap-2">
						<div className="text-lg font-black leading-none text-white">{rankLabel(data.rank)}</div>
						<div className="rounded-md border border-amber-200/22 bg-amber-300/14 px-2 py-0.5 font-mono text-xs font-black text-amber-100">
							{data.rank?.leaguePoints ?? 0} LP
						</div>
					</div>
				</div>
				<div className={`shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs font-black ${lpTone}`}>
					{lpDelta > 0 ? "+" : ""}
					{lpDelta} LP
				</div>
			</div>

			<div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
				<RankProgress rank={data.rank} progress={rankProgress} compact />
				<div className="text-right">
					<div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/38">Session</div>
					<div className="font-mono text-sm font-black text-emerald-50">
						{data.sessionWins}W · {data.sessionLosses}L
					</div>
				</div>
				<div className="text-right">
					<div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/38">Games</div>
					<div className="font-mono text-sm font-black text-emerald-50">{gamesPlayed}</div>
				</div>
			</div>
		</div>
	);
}
