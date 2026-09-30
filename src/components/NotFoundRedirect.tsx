"use client";

import { useEffect, useState } from "react";
import { CreatorCredit } from "@/components/CreatorCredit";

const REDIRECT_DELAY_SECONDS = 5;

export function NotFoundRedirect() {
	const [seconds, setSeconds] = useState(REDIRECT_DELAY_SECONDS);

	useEffect(() => {
		const countdown = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1_000);
		const redirect = window.setTimeout(() => window.location.replace(mainSiteUrl()), REDIRECT_DELAY_SECONDS * 1_000);

		return () => {
			window.clearInterval(countdown);
			window.clearTimeout(redirect);
		};
	}, []);

	return (
		<main className="site-message">
			<div className="relative mx-auto grid w-full max-w-4xl gap-5">
				<section className="content-panel">
					<div className="flex items-center gap-4">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/bear-logo.png"
							alt=""
							width={64}
							height={64}
							className="size-16 rounded-2xl border border-lime-200/30 object-cover shadow-[0_0_24px_rgba(183,243,107,.18)]"
						/>
						<div>
							<div className="panel-kicker">Fehler 404</div>
							<div className="mt-1 text-sm font-black uppercase tracking-[0.18em] text-emerald-100/80">Falscher Weg im Jungle</div>
						</div>
					</div>

					<h1 className="mt-8 max-w-xl text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">Diese Seite ist nicht auf der Map.</h1>
					<p className="mt-4 max-w-xl leading-7 text-[var(--muted)]">
						Der Link ist möglicherweise veraltet oder die Seite wurde verschoben. Wir bringen dich in {seconds} {seconds === 1 ? "Sekunde" : "Sekunden"} zurück zur
						Lauchgruen-Startseite.
					</p>

					<div className="mt-7 flex flex-wrap items-center gap-3">
						<button type="button" onClick={() => window.location.replace(mainSiteUrl())} className="button primary">
							Jetzt zur Startseite
						</button>
						<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/35">Automatische Weiterleitung aktiv</span>
					</div>
				</section>
				<div className="flex justify-center text-[10px] font-bold tracking-wide text-emerald-100/45">
					<CreatorCredit />
				</div>
			</div>
		</main>
	);
}

function mainSiteUrl() {
	const { hostname, port } = window.location;
	if (hostname === "localhost" || hostname.endsWith(".localhost")) {
		return `http://lauchgruen.localhost${port ? `:${port}` : ""}`;
	}
	return "https://lauchgruen.de";
}
