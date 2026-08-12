export interface TwitchClipCardData {
	id: string;
	url: string;
	embedUrl: string;
	title: string;
	thumbnailUrl: string;
	viewCount: number;
	durationSec: number;
	createdAt: string;
	creatorName: string;
}

function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const minutes = Math.floor(total / 60);
	const remaining = total % 60;
	return minutes > 0 ? `${minutes}:${remaining.toString().padStart(2, "0")}` : `${remaining}s`;
}

function formatDate(iso: string): string {
	return new Intl.DateTimeFormat("de-DE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(iso));
}

export function TwitchClipCard({ clip }: { clip: TwitchClipCardData }) {
	return (
		<a
			href={clip.url}
			target="_blank"
			rel="noreferrer"
			className="group flex min-w-0 flex-col overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/24 transition duration-300 hover:-translate-y-1 hover:border-lime-200/30 hover:bg-white/[0.06]"
		>
			<div className="relative aspect-video overflow-hidden bg-emerald-950">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={clip.thumbnailUrl}
					alt={clip.title}
					loading="lazy"
					className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.045]"
				/>
				<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/5" />
				<div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-lime-100 backdrop-blur-md">
					{formatDuration(clip.durationSec)}
				</div>
				<div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[10px] font-bold text-emerald-100 backdrop-blur-md">
					{clip.viewCount.toLocaleString("de-DE")} Views
				</div>
				<span className="absolute bottom-4 left-4 grid size-10 translate-y-2 place-items-center rounded-full border border-white/15 bg-lime-200 text-emerald-950 opacity-0 shadow-lg shadow-black/25 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
					<svg aria-hidden="true" viewBox="0 0 24 24" className="ml-0.5 size-4 fill-current">
						<path d="M8 5v14l11-7z" />
					</svg>
				</span>
			</div>

			<div className="flex flex-1 flex-col justify-between gap-4 p-5">
				<div className="line-clamp-2 text-base font-black leading-snug text-emerald-50 transition group-hover:text-lime-100">{clip.title}</div>
				<div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-100/48">
					<span className="truncate">von {clip.creatorName}</span>
					<span className="shrink-0">{formatDate(clip.createdAt)}</span>
				</div>
			</div>
		</a>
	);
}
