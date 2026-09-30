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
				["Archiv & Hall of Fame", `${tournament}/winners`],
				["Turnierregeln", `${tournament}/terms`],
				["Datenschutz", `${tournament}/privacy`],
			],
		},
	];
	return (
		<footer className="site-footer relative z-10 mt-10">
			<div className="footer-main">
				<div>
					<a href={`${apex}/`} aria-label="Lauchgruen Startseite" className="footer-mark">
						<Image src="/bear-logo.png" alt="" width={52} height={52} className="size-full object-cover" />
					</a>
					<h2>
						Gute Games.
						<br />
						<span className="text-[var(--accent)]">Gute Gesellschaft.</span>
					</h2>
					<p>{label}</p>
				</div>
				{groups.map((group) => (
					<nav key={group.title} aria-label={`Footer: ${group.title}`} className="footer-links">
						<strong>{group.title}</strong>
						{group.links.map(([name, href]) => (
							<a key={name} href={href}>
								{name}
							</a>
						))}
					</nav>
				))}
			</div>
			<RiotDisclaimer productName="Lauchgruen" className="max-w-4xl border-t border-[var(--line)] py-5 text-[11px] leading-5 text-[var(--muted)]/75" />
			<div className="footer-bottom">
				<div className="flex flex-wrap items-center gap-2">
					<span translate="no">© 2026 Lauchgruen</span>
					<span aria-hidden="true">·</span>
					<a href="https://www.twitch.tv/lauchgruen" target="_blank" rel="noreferrer">
						Lauchgruen auf Twitch
					</a>
					<span aria-hidden="true">·</span>
					<CreatorCredit />
				</div>
				<span>League, Community und ein bisschen Chaos.</span>
			</div>
		</footer>
	);
}
