import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { germanTierName } from "@/components/obs/shared/utils";

export function RankProgress({ rank, progress, compact = false }: { rank: LauchgruenObsResponse["rank"]; progress: number; compact?: boolean }) {
	return (
		<div>
			<div className={`mb-1 flex items-center justify-between font-mono font-black uppercase tracking-[0.08em] text-emerald-100/44 ${compact ? "text-[8px]" : "text-[9px]"}`}>
				<span>{rank ? `${germanTierName(rank.tier)} IV` : "Ohne Rang"}</span>
				<span>{Math.round(progress)}%</span>
				<span>{rank ? germanTierName(rank.nextTierLabel.split(" ")[0]) : "Nächstes Ziel"}</span>
			</div>
			<div className="relative h-2 overflow-hidden rounded-full bg-black/42 ring-1 ring-white/10">
				<div
					className="h-full rounded-full bg-gradient-to-r from-amber-300 via-lime-300 to-cyan-200 shadow-[0_0_14px_rgba(190,242,100,0.45)]"
					style={{ width: `${progress}%` }}
				/>
				<div className="absolute inset-0 grid grid-cols-4">
					{[0, 1, 2, 3].map((part) => (
						<div key={part} className="border-r border-black/45 last:border-r-0" />
					))}
				</div>
			</div>
		</div>
	);
}
