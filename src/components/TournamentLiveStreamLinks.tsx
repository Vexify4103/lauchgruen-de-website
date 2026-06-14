import type { TournamentLiveStream } from "@/lib/tournament-live-streams";

export function TournamentLiveStreamLinks({
  streams,
  compact = false,
}: {
  streams: TournamentLiveStream[];
  compact?: boolean;
}) {
  if (streams.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-3"}`}>
      {streams.map((stream) => (
        <a
          key={`${stream.discordId}-${stream.twitchLogin}`}
          href={`https://twitch.tv/${encodeURIComponent(stream.twitchLogin)}`}
          target="_blank"
          rel="noreferrer"
          title={stream.title}
          className={`inline-flex items-center gap-2 rounded-full border font-black transition hover:-translate-y-0.5 ${
            stream.preview
              ? "border-amber-200/30 bg-amber-300/12 text-amber-50 hover:border-amber-100/60 hover:bg-amber-300/20"
              : "border-[#bf94ff]/30 bg-[#9146ff]/18 text-[#efe5ff] hover:border-[#bf94ff]/60 hover:bg-[#9146ff]/30"
          } ${
            compact
              ? "px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]"
              : "px-3 py-2 text-xs"
          }`}
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-red-400" />
          </span>
          {stream.twitchDisplayName} {stream.preview ? "Vorschau" : "live"}
          {!compact && !stream.preview ? (
            <span className="font-bold text-[#d8c4f6]/60">
              {stream.viewerCount.toLocaleString("de-DE")}
            </span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
