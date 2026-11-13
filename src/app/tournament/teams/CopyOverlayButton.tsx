/** One entry point for streamers: the setup page lists every OBS source for this team, including the compact team overlay. */
export function CopyOverlayButton({ teamId }: { teamId: string }) {
	return (
		<a
			href={`/obs/broadcast?team=${encodeURIComponent(teamId)}`}
			target="_blank"
			rel="noreferrer"
			title="OBS-Browser-Quellen für dieses Team: Team-Overlay, Match-Leiste, Pausenbildschirm, Champ Select und mehr"
			className="button ghost small"
		>
			OBS-Overlays ↗
		</a>
	);
}
