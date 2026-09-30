import { LoadingIndicator } from "@/components/LoadingIndicator";

export default function TournamentAdminLoading() {
	return (
		<div aria-busy="true">
			<LoadingIndicator label="Admin-Bereich wird geladen…" compact className="mb-5" />
			<div aria-hidden="true" className="motion-safe:animate-pulse">
				<div className="control-overview h-72" />
				<div className="admin-split">
					<div className="admin-panel h-80" />
					<div className="admin-panel h-80" />
				</div>
			</div>
		</div>
	);
}
