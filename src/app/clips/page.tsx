import type { Metadata } from "next";
import { ClipsArchive } from "./ClipsArchive";
import { SiteFooter } from "@/components/SiteFooter";
import { ApexHeader } from "@/components/site/ApexHeader";
import { headers } from "next/headers";
import { getSiteUrls } from "@/lib/site-urls";

export const metadata: Metadata = {
	title: "Clips",
	description: "Aktuelle Highlights und beliebte Twitch-Clips von Lauchgruen.",
};

export default async function ClipsPage() {
	const urls = getSiteUrls((await headers()).get("host"));
	return (
		<div className="relative min-h-screen overflow-hidden bg-[#020b07] text-emerald-50">
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_4%,rgba(163,230,53,0.12),transparent_29%),radial-gradient(circle_at_92%_26%,rgba(34,211,238,0.09),transparent_27%),linear-gradient(155deg,#020b07_0%,#04140c_48%,#020906_100%)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]"
			/>

			<a href="#main-content" className="skip-link">
				Zum Inhalt
			</a>
			<ApexHeader apexUrl={urls.apex} tournamentUrl={urls.tournament} brand="clips" />

			<main id="main-content" tabIndex={-1} className="relative z-10 mx-auto w-full max-w-[90rem] px-5 py-10 sm:px-8 sm:py-14">
				<section className="relative overflow-hidden rounded-[2.4rem] border border-lime-200/13 bg-[linear-gradient(140deg,#0a2013_0%,#06160e_58%,#07171a_100%)] p-7 shadow-2xl shadow-black/30 sm:p-10">
					<div aria-hidden className="absolute -right-16 -top-24 size-80 rounded-full border border-lime-100/[0.07]" />
					<div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(190,242,100,0.13),transparent_30%)]" />
					<div className="relative">
						<div className="text-[9px] font-black uppercase tracking-[0.32em] text-lime-200/58">Direkt aus dem Stream</div>
						<h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.055em] sm:text-6xl">Momente, die bleiben durften.</h1>
						<p className="mt-5 max-w-2xl text-sm leading-7 text-emerald-100/58">
							Neue Highlights, alte Klassiker und genau die Szenen, die der Chat nicht vergessen wollte. Direkt von Twitch gesammelt.
						</p>
					</div>
				</section>

				<section className="mt-8">
					<ClipsArchive />
				</section>
			</main>

			<SiteFooter apexUrl={urls.apex} tournamentUrl={urls.tournament} />
		</div>
	);
}
