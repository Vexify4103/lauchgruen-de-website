import { LoadingIndicator } from "@/components/LoadingIndicator";

export function PageLoading() {
	return (
		<div className="page-section min-h-[50vh]" aria-busy="true">
			<LoadingIndicator label="Seite wird geladen…" />
			<div aria-hidden="true" className="grid gap-5 motion-safe:animate-pulse sm:grid-cols-2">
				<div className="content-panel h-48" />
				<div className="content-panel h-48" />
			</div>
		</div>
	);
}
