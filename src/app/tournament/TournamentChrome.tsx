"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TournamentLink as Link, TournamentUrlProvider } from "./TournamentLink";

type NavItem = {
	href: string;
	label: string;
	disabled?: boolean;
};

type TournamentStatus = "Ankündigung" | "Anmeldung" | "Vorbereitung" | "Live";

export function TournamentChrome({
	children,
	navItems,
	applicationsOpen,
	tournamentStatus,
	apexUrl,
	cleanUrls,
	accountControl,
	compactAccountControl,
	footerTournamentLabel,
}: {
	children: ReactNode;
	navItems: NavItem[];
	applicationsOpen: boolean;
	tournamentStatus: TournamentStatus;
	apexUrl: string;
	cleanUrls: boolean;
	accountControl: ReactNode;
	compactAccountControl: ReactNode;
	footerTournamentLabel: string;
}) {
	const pathname = usePathname();
	const focusedDraft = pathname.startsWith("/tournament/champ-select/") || pathname.includes("/champ-select/");

	return (
		<TournamentUrlProvider cleanUrls={cleanUrls}>
			<div className="min-h-screen bg-[#07110c] text-emerald-50">
				<div className="pointer-events-none fixed inset-0 overflow-hidden">
					<div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-lime-300/10 blur-3xl" />
					<div className="absolute bottom-[-14rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
					<div className="absolute right-[-10rem] top-[22rem] h-[30rem] w-[30rem] rounded-full bg-amber-300/10 blur-3xl" />
				</div>

				{focusedDraft ? (
					<FocusedDraftNavigation navItems={navItems} applicationsOpen={applicationsOpen} tournamentStatus={tournamentStatus} accountControl={compactAccountControl} />
				) : (
					<FullTournamentHeader navItems={navItems} applicationsOpen={applicationsOpen} tournamentStatus={tournamentStatus} accountControl={accountControl} />
				)}

				<main className={`relative z-10 ${focusedDraft ? "pt-9" : ""}`}>{children}</main>

				{focusedDraft ? null : (
					<footer className="relative z-10 border-t border-lime-200/10 px-5 py-8">
						<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-sm text-emerald-100/54 sm:flex-row sm:items-center sm:justify-between">
							<p>{footerTournamentLabel}</p>
							<div className="flex flex-wrap gap-x-4 gap-y-2">
								<Link href="/tournament/privacy" className="font-bold text-lime-200/80 hover:text-lime-100">
									Datenschutz
								</Link>
								<Link href="/tournament/terms" className="font-bold text-lime-200/80 hover:text-lime-100">
									Teilnahmebedingungen
								</Link>
								<Link href="/tournament/winners" className="font-bold text-lime-200/80 hover:text-lime-100">
									Archiv & Hall of Fame
								</Link>
								<a href={apexUrl} className="font-bold text-lime-200/80 hover:text-lime-100">
									Zurück zu lauchgruen.de
								</a>
							</div>
						</div>
					</footer>
				)}
			</div>
		</TournamentUrlProvider>
	);
}

function FocusedDraftNavigation({
	navItems,
	applicationsOpen,
	tournamentStatus,
	accountControl,
}: {
	navItems: NavItem[];
	applicationsOpen: boolean;
	tournamentStatus: TournamentStatus;
	accountControl: ReactNode;
}) {
	return (
		<div className="fixed left-1/2 top-0 z-50 -translate-x-1/2">
			<details className="group relative">
				<summary className="list-none rounded-b-2xl border-x border-b border-white/10 bg-[#1d1d1d]/96 px-7 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-emerald-50 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:bg-[#252525] [&::-webkit-details-marker]:hidden">
					Navigation
				</summary>
				<div className="absolute left-1/2 top-full mt-2 w-72 -translate-x-1/2 rounded-2xl border border-white/12 bg-[#101613]/96 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
					<div className={`mb-2 rounded-xl border px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] ${statusTone(tournamentStatus)}`}>{tournamentStatus}</div>
					<nav className="grid gap-1">
						{navItems.map((item) => (
							<NavLinkItem key={item.href} item={item} applicationsOpen={applicationsOpen} compact />
						))}
					</nav>
					<div className="mt-2 border-t border-white/10 pt-2">{accountControl}</div>
				</div>
			</details>
		</div>
	);
}

function FullTournamentHeader({
	navItems,
	applicationsOpen,
	tournamentStatus,
	accountControl,
}: {
	navItems: NavItem[];
	applicationsOpen: boolean;
	tournamentStatus: TournamentStatus;
	accountControl: ReactNode;
}) {
	return (
		<header className="sticky top-0 z-30 border-b border-lime-200/10 bg-[#07110c]/78 px-5 py-4 backdrop-blur-2xl">
			<nav className="mx-auto flex w-full max-w-7xl flex-col gap-4 xl:flex-row xl:items-center">
				<Link href="/tournament" className="group inline-flex w-fit items-center gap-3">
					<span className="relative size-12 overflow-hidden rounded-2xl border border-lime-300/40 bg-[#06130b] shadow-[0_0_24px_rgba(163,230,53,0.18)] transition group-hover:border-lime-200/70 group-hover:shadow-[0_0_30px_rgba(163,230,53,0.28)]">
						<Image src="/tournament-bear-mark.png" alt="Lauchgruen Bärenkopf" fill sizes="48px" className="object-cover" priority unoptimized />
					</span>
					<span>
						<span className="block text-sm font-black uppercase tracking-[0.28em] text-lime-200/70">lauchgruen</span>
						<span className="block text-lg font-black tracking-tight text-emerald-50 group-hover:text-lime-200">Turnier</span>
					</span>
				</Link>

				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:justify-end">
					<span className={`shrink-0 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone(tournamentStatus)}`} title={`Turniermodus: ${tournamentStatus}`}>{tournamentStatus}</span>
					<div className="flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-1">
						{navItems.map((item) => (
							<NavLinkItem key={item.href} item={item} applicationsOpen={applicationsOpen} />
						))}
					</div>
					{accountControl}
				</div>
			</nav>
		</header>
	);
}

function NavLinkItem({ item, applicationsOpen, compact = false }: { item: NavItem; applicationsOpen: boolean; compact?: boolean }) {
	const isApply = item.href === "/tournament/apply";
	if (item.disabled) {
		return <span aria-disabled="true" title="Für dieses Turnier noch nicht verfügbar" className={`cursor-not-allowed whitespace-nowrap rounded-xl font-bold text-emerald-100/24 ${compact ? "px-3 py-2 text-sm" : "px-2.5 py-2 text-sm"}`}>{item.label}</span>;
	}

	if (isApply && !applicationsOpen) {
		return (
			<span
				aria-disabled="true"
				title="Bewerbungen sind aktuell geschlossen"
				className={`cursor-not-allowed whitespace-nowrap rounded-xl font-bold text-emerald-100/28 ${compact ? "px-3 py-2 text-sm" : "px-2.5 py-2 text-sm"}`}
			>
				{item.label}
			</span>
		);
	}

	if (isApply) {
		return (
			<Link
				href={item.href}
				className={`whitespace-nowrap rounded-xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 font-black uppercase tracking-[0.12em] text-[#07110c] shadow-lg shadow-lime-300/20 transition hover:scale-[1.02] hover:shadow-lime-200/35 ${
					compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-xs"
				}`}
			>
				Jetzt bewerben
			</Link>
		);
	}

	return (
		<Link
			href={item.href}
			className={`whitespace-nowrap rounded-xl font-bold text-emerald-100/68 transition hover:bg-lime-200/10 hover:text-lime-100 ${
				compact ? "px-3 py-2 text-sm" : "px-2.5 py-2 text-sm"
			}`}
		>
			{item.label}
		</Link>
	);
}

function statusTone(status: TournamentStatus) {
	switch (status) {
		case "Live": return "border-red-300/30 bg-red-500/14 text-red-100";
		case "Anmeldung": return "border-lime-200/24 bg-lime-200/10 text-lime-100";
		case "Ankündigung": return "border-cyan-200/20 bg-cyan-300/10 text-cyan-100";
		default: return "border-amber-200/18 bg-amber-200/8 text-amber-100/72";
	}
}
