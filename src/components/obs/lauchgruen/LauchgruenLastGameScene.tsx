import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { queueLabel } from "@/components/obs/shared/utils";

export function LauchgruenLastGameScene({
	active,
	data,
	gamesPlayed,
	lpDelta,
	lpTone,
}: {
	active: boolean;
	data: LauchgruenObsResponse;
	gamesPlayed: number;
	lpDelta: number;
	lpTone: string;
}) {
	const featured = data.lastGames[0];
	const minutes = featured ? Math.floor(featured.durationSeconds / 60) : 0;
	const seconds = featured ? featured.durationSeconds % 60 : 0;

	return (
		<div
			className={`obs-small-scene absolute inset-0 grid h-full grid-cols-[auto_1fr_auto] items-center gap-3 ${active ? "obs-small-scene-active opacity-100 blur-0" : "pointer-events-none translate-x-4 opacity-0 blur-md"}`}
		>
			{featured ? (
				<div
					className={`relative size-16 overflow-hidden rounded-xl border-2 ${featured.win ? "border-lime-300 shadow-[0_0_16px_rgba(132,204,22,0.5)]" : "border-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.45)]"}`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={featured.championIconUrl} alt={featured.championName} className="size-full object-cover" />
					<div
						className={`absolute bottom-0 right-0 rounded-tl-md px-1.5 py-0.5 text-[9px] font-black ${featured.win ? "bg-lime-300 text-emerald-950" : "bg-rose-400 text-white"}`}
					>
						{featured.win ? "W" : "L"}
					</div>
				</div>
			) : (
				<div className="size-16 rounded-xl border border-white/10 bg-black/30" />
			)}

			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<div className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-white">{featured?.championName ?? "Noch keine Games"}</div>
					{featured ? (
						<div className="shrink-0 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-cyan-100">
							{queueLabel(featured.queueId)}
						</div>
					) : null}
					{featured ? (
						<div className={`text-[8px] font-black uppercase ${featured.win ? "text-lime-300" : "text-rose-300"}`}>{featured.win ? "Sieg" : "Niederlage"}</div>
					) : null}
				</div>
				{featured ? (
					<>
						<div className="mt-1 flex items-center gap-2 font-mono text-[10px] font-black text-white/80">
							<span className="text-white">{featured.kda}</span>
							<span>{featured.creepScore} CS</span>
							<span>{(featured.goldEarned / 1000).toFixed(1)}k</span>
							<span>
								{minutes}:{String(seconds).padStart(2, "0")}
							</span>
						</div>
						<div className="mt-1.5 flex gap-1">
							{featured.items.map((item, index) => (
								<div key={`${item.id}-${index}`} className="size-6 overflow-hidden rounded border border-white/20 bg-black/30">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
								</div>
							))}
						</div>
					</>
				) : null}
			</div>

			<div className="shrink-0 text-right">
				<div className="font-mono text-sm font-black text-emerald-50">
					{data.sessionWins}W · {data.sessionLosses}L
				</div>
				<div className={`mt-1 font-mono text-xs font-black ${lpTone}`}>
					{lpDelta > 0 ? "+" : ""}
					{lpDelta} LP
				</div>
				<div className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/36">{gamesPlayed} Games</div>
			</div>
		</div>
	);
}
