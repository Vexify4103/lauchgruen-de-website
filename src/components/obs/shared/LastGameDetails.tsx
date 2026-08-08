import type { LauchgruenObsResponse } from "@/lib/streamer-obs";

export function LastGameDetails({
	game,
	itemClassName = "size-10",
	className = "",
}: {
	game: LauchgruenObsResponse["lastGames"][number];
	itemClassName?: string;
	className?: string;
}) {
	const minutes = Math.floor(game.durationSeconds / 60);
	const seconds = game.durationSeconds % 60;

	return (
		<div className={className}>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm font-bold text-white/85">
				<span className="text-lg text-white">{game.kda} KDA</span>
				<span>{game.creepScore} CS</span>
				<span>{(game.goldEarned / 1000).toFixed(1)}k Gold</span>
				<span>
					{minutes}:{String(seconds).padStart(2, "0")}
				</span>
			</div>
			<div className="mt-3 flex min-h-10 flex-wrap gap-1.5">
				{game.items.map((item, index) => (
					<div key={`${item.id}-${index}`} className={`${itemClassName} overflow-hidden rounded-lg border border-white/30 shadow-md shadow-black/70`}>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={item.iconUrl} alt={`Item ${item.id}`} className="size-full object-cover" />
					</div>
				))}
			</div>
		</div>
	);
}
