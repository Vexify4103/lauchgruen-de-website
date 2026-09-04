"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { CreatorCredit } from "@/components/CreatorCredit";
import { RiotDisclaimer } from "@/components/RiotDisclaimer";

export function SiteFooter({
	apexUrl = "",
	tournamentUrl = "/tournament",
	label = "Stream, Community und gute Abende.",
}: {
	apexUrl?: string;
	tournamentUrl?: string;
	label?: string;
}) {
	const pathname = usePathname();
	if (pathname.split("/").some((segment) => ["obs", "champ-select", "quiz"].includes(segment))) return null;
	const apex = apexUrl.replace(/\/$/, "");
	const tournament = tournamentUrl.replace(/\/$/, "");
	const groups = [
		{
			title: "Entdecken",
			links: [
				["Startseite", `${apex}/`],
				["Clips", `${apex}/clips`],
				["OBS-Overlay Builder", `${apex}/overlay`],
				["Mein Konto", `${apex}/me`],
			],
		},
		{
			title: "Turnier",
			links: [
				["Übersicht", tournament || "/"],
				["Teams", `${tournament}/teams`],
				["Zeitplan", `${tournament}/schedule`],
				["Playoffs", `${tournament}/playoffs`],
			],
		},
		{
			title: "Gut zu wissen",
			links: [
				["Turnierregeln", `${tournament}/terms`],
				["Datenschutz", `${tournament}/privacy`],
				["Archiv & Gewinner", `${tournament}/winners`],
				["Lauchgruen auf Twitch", "https://www.twitch.tv/lauchgruen"],
			],
		},
	];
	return (
		<footer className="relative z-10 mt-10 overflow-hidden border-t border-lime-200/15 bg-[#041009] px-5 pb-6 pt-12 text-emerald-50 sm:px-8 sm:pt-16">
			<div
				aria-hidden
				className="pointer-events-none absolute -left-40 -top-60 size-[38rem] rounded-full bg-[radial-gradient(circle,rgba(163,230,53,0.09),transparent_65%)]"
			/>
			<div className="relative mx-auto w-full max-w-7xl">
				<div className="grid gap-x-8 gap-y-10 pb-12 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
					<div className="sm:col-span-3 lg:col-span-1">
						<a
							href={`${apex}/`}
							aria-label="Lauchgruen Startseite"
							className="inline-flex rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-200"
						>
							<Image src="/bear-logo.png" alt="" width={52} height={52} className="size-13 rounded-2xl border border-lime-200/20" />
						</a>
						<h2 className="mt-5 text-3xl font-black leading-[1.05] tracking-[-0.045em] sm:text-4xl">
							Gute Games.
							<br />
							<span className="text-lime-200">Gute Gesellschaft.</span>
						</h2>
						<p className="mt-4 max-w-xs text-xs leading-6 text-emerald-100/55">{label}</p>
					</div>
					{groups.map((group) => (
						<nav key={group.title} aria-label={`Footer: ${group.title}`} className="flex flex-col items-start gap-3">
							<h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/65">{group.title}</h3>
							{group.links.map(([name, href]) => (
								<a
									key={name}
									href={href}
									className="rounded-sm py-1 text-sm font-bold text-emerald-100/65 transition-colors hover:text-lime-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-200"
								>
									{name}
								</a>
							))}
						</nav>
					))}
				</div>
				<CreatorCredit />
				<RiotDisclaimer productName="Lauchgruen" className="mt-7 max-w-5xl text-[10px] leading-5 text-emerald-100/40" />
				<div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5 text-[10px] font-bold tracking-wide text-emerald-100/45">
					<span>© Lauchgruen</span>
					<span>League, Community und ein bisschen Chaos.</span>
				</div>
			</div>
		</footer>
	);
}
