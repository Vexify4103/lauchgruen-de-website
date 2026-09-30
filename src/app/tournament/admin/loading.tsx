export default function TournamentAdminLoading() {
	return (
		<div role="status" aria-label="Wird geladen…" className="animate-pulse motion-reduce:animate-none">
			<div className="control-overview h-72" />
			<div className="admin-split">
				<div className="admin-panel h-80" />
				<div className="admin-panel h-80" />
			</div>
		</div>
	);
}
