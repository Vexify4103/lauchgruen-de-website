"use client";

import { useEffect, useState } from "react";

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
		<main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#03100a] px-5 py-10 text-emerald-50">
			<div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(183,243,107,.13),transparent_34%),radial-gradient(circle_at_82%_78%,rgba(88,224,210,.12),transparent_36%)]" />
			<div aria-hidden className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(183,243,107,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(183,243,107,.16)_1px,transparent_1px)] [background-size:44px_44px]" />

			<section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-lime-200/18 bg-[#08170f]/94 p-7 shadow-2xl shadow-black/45 sm:p-10">
				<div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-200 to-cyan-200" />
				<div className="flex items-center gap-4">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/bear-logo.png" alt="" className="size-16 rounded-2xl border border-lime-200/30 object-cover shadow-[0_0_24px_rgba(183,243,107,.18)]" />
					<div>
						<div className="text-[10px] font-black uppercase tracking-[0.3em] text-lime-200/60">Fehler 404</div>
						<div className="mt-1 text-sm font-black uppercase tracking-[0.18em] text-emerald-100/80">Falscher Weg im Jungle</div>
					</div>
				</div>

				<h1 className="mt-8 max-w-xl text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">Diese Seite ist nicht auf der Map.</h1>
				<p className="mt-4 max-w-xl text-sm leading-7 text-emerald-100/58 sm:text-base">
					Der Link ist möglicherweise veraltet oder die Seite wurde verschoben. Wir bringen dich in {seconds} {seconds === 1 ? "Sekunde" : "Sekunden"} zurück zur Lauchgruen-Startseite.
				</p>

				<div className="mt-7 flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={() => window.location.replace(mainSiteUrl())}
						className="rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-lime-300/10 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-200"
					>
						Jetzt zur Startseite
					</button>
					<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/35">Automatische Weiterleitung aktiv</span>
				</div>
			</section>
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
