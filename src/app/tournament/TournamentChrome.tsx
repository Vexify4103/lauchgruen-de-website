"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader, type SiteNavItem } from "@/components/site/SiteHeader";
import type { HeroTone, TournamentHeroData, TournamentSubnavItem } from "@/lib/tournament-presentation";
import { TournamentHero, TournamentSubnav } from "./TournamentHero";
import { TournamentLink, TournamentUrlProvider } from "./TournamentLink";

/** Pages of the active tournament that share the hero and the tournament subnavigation. */
const HUB_ROUTES = ["/", "/teams", "/stage", "/playoffs", "/schedule", "/live", "/fearless", "/pools", "/captain"];

function relativePath(path: string) {
	return path.replace(/^\/tournament(?=\/|$)/, "") || "/";
}

export function TournamentChrome({
	children,
	navItems,
	hero,
	subnavItems,
	status,
	apexUrl,
	cleanUrls,
	accountControl,
	compactAccountControl,
	footerTournamentLabel,
}: {
	children: ReactNode;
	navItems: SiteNavItem[];
	hero: TournamentHeroData;
	subnavItems: TournamentSubnavItem[];
	status: { label: string; tone: HeroTone };
	apexUrl: string;
	cleanUrls: boolean;
	accountControl: ReactNode;
	compactAccountControl: ReactNode;
	footerTournamentLabel: string;
}) {
	const pathname = usePathname();
	const path = relativePath(pathname);
	const focusedDraft = path.startsWith("/champ-select/");
	// The admin control room brings its own shell (sidebar and page head), like the HappyGiganto platform.
	const adminRoute = path === "/admin" || path.startsWith("/admin/");
	const hubRoute = HUB_ROUTES.includes(path);

	if (adminRoute) {
		return (
			<TournamentUrlProvider cleanUrls={cleanUrls}>
				<a href="#main-content" className="skip-link">
					Zum Inhalt
				</a>
				<main id="main-content" tabIndex={-1} className="outline-none">
					{children}
				</main>
			</TournamentUrlProvider>
		);
	}

	return (
		<TournamentUrlProvider cleanUrls={cleanUrls}>
			<div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
				<a href="#main-content" className="skip-link">
					Zum Inhalt
				</a>

				{focusedDraft ? (
					<FocusedDraftNavigation navItems={navItems} subnavItems={subnavItems} status={status} accountControl={compactAccountControl} />
				) : (
					<SiteHeader
						homeHref="/tournament"
						homeLabel="Lauchgruen Turnier – Übersicht"
						brand="turnier"
						navItems={navItems}
						status={<StatusChip status={status} />}
						account={accountControl}
					/>
				)}

				<main id="main-content" tabIndex={-1} className={`relative z-10 outline-none ${focusedDraft ? "pt-9" : ""}`}>
					{hubRoute ? (
						<>
							<TournamentHero hero={hero} compact={path !== "/"} />
							{subnavItems.length > 1 ? <TournamentSubnav items={subnavItems} /> : null}
						</>
					) : null}
					{children}
				</main>

				{focusedDraft ? null : <SiteFooter apexUrl={apexUrl} tournamentUrl={cleanUrls ? "" : "/tournament"} label={footerTournamentLabel} />}
			</div>
		</TournamentUrlProvider>
	);
}

function StatusChip({ status }: { status: { label: string; tone: HeroTone } }) {
	return (
		<span className="status-chip" data-tone={status.tone === "muted" ? undefined : status.tone} title={`Turnierstatus: ${status.label}`}>
			<i aria-hidden="true" />
			{status.label}
		</span>
	);
}

function FocusedDraftNavigation({
	navItems,
	subnavItems,
	status,
	accountControl,
}: {
	navItems: SiteNavItem[];
	subnavItems: TournamentSubnavItem[];
	status: { label: string; tone: HeroTone };
	accountControl: ReactNode;
}) {
	const links = [...subnavItems, ...navItems.filter((item) => !item.external && !subnavItems.some((entry) => entry.href === item.href))];
	return (
		<div className="fixed left-1/2 top-0 z-50 -translate-x-1/2">
			<details className="group relative">
				<summary className="list-none rounded-b-2xl border-x border-b border-[var(--line)] bg-[var(--panel-solid)]/96 px-7 py-2 text-center font-display text-xs font-bold uppercase tracking-[0.18em] text-[var(--text)] shadow-2xl shadow-black/40 backdrop-blur-xl transition-colors hover:bg-[var(--panel-solid)] [&::-webkit-details-marker]:hidden">
					Navigation
				</summary>
				<div className="absolute left-1/2 top-full mt-2 w-72 -translate-x-1/2 rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)]/96 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
					<div className="mb-2 flex justify-center">
						<StatusChip status={status} />
					</div>
					<nav className="grid gap-1" aria-label="Turnierseiten">
						{links.map((item) => (
							<TournamentLink
								key={item.href}
								href={item.href}
								className="rounded-xl px-3 py-2 text-sm font-bold text-[var(--muted)] transition-colors hover:bg-[var(--accent)]/10 hover:text-[var(--text)]"
							>
								{item.label}
							</TournamentLink>
						))}
					</nav>
					<div className="mt-2 border-t border-[var(--line)] pt-2">{accountControl}</div>
				</div>
			</details>
		</div>
	);
}
