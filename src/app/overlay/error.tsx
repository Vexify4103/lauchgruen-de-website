"use client";

export default function OverlayError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<main id="main-content" className="site-message">
			<section className="content-panel w-full max-w-xl text-center">
				<div className="panel-kicker">Overlay Builder</div>
				<h1 className="mt-3 text-3xl font-black">Die Vorschau konnte nicht gestartet werden.</h1>
				<p className="mt-3 leading-7 text-[var(--muted)]">
					Deine Einstellungen in der URL bleiben erhalten. Meist reicht ein erneuter Versuch, sobald Riot oder Twitch wieder antwortet.
				</p>
				<button type="button" onClick={reset} className="button primary mt-5">
					Erneut versuchen
				</button>
			</section>
		</main>
	);
}
