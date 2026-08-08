export function LiveBadge({ online, leagueLive }: { online: boolean; leagueLive: boolean }) {
	const label = !online ? "Offline" : leagueLive ? "LoL Live" : "Live";
	const tone = !online
		? "border-white/10 bg-white/8 text-emerald-100/52"
		: leagueLive
			? "border-lime-300/30 bg-lime-300/14 text-lime-100"
			: "border-amber-300/28 bg-amber-300/12 text-amber-100";

	return (
		<div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${tone}`}>
			<span className={`size-1.5 rounded-full ${online ? "animate-pulse bg-red-400" : "bg-emerald-100/30"}`} />
			{label}
		</div>
	);
}
