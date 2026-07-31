import Image from "next/image";
import type { ReactNode } from "react";
import { RiotDisclaimer } from "@/components/RiotDisclaimer";

export function MainAccountChrome({ children, apexUrl, tournamentUrl }: { children: ReactNode; apexUrl: string; tournamentUrl: string }) {
	return (
		<div className="relative min-h-screen overflow-hidden bg-[#020b07] text-emerald-50">
			<a href="#main-content" className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-xl bg-lime-200 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-xl transition focus:translate-y-0">
				Zum Inhalt
			</a>
			<div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_4%,rgba(163,230,53,0.12),transparent_29%),radial-gradient(circle_at_92%_26%,rgba(34,211,238,0.09),transparent_27%),linear-gradient(155deg,#020b07_0%,#04140c_48%,#020906_100%)]" />
			<div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]" />

			<header className="sticky top-0 z-50 border-b border-white/7 bg-[#020b07]/88 shadow-lg shadow-black/10 backdrop-blur-xl">
				<div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
					<a href={apexUrl} className="flex min-w-0 items-center gap-3">
						<Image src="/bear-logo.png" alt="Lauchgruen" width={48} height={48} priority className="size-12 rounded-2xl border border-lime-200/24 object-cover shadow-[0_0_24px_rgba(163,230,53,0.13)]" />
						<div className="min-w-0">
							<div className="truncate text-[10px] font-black uppercase tracking-[0.34em] text-lime-200/68">Lauchgruen</div>
							<div className="mt-0.5 text-sm font-black text-emerald-50">Mein Konto</div>
						</div>
					</a>
					<nav aria-label="Kontonavigation" className="flex items-center gap-2">
						<a href={`${apexUrl}/overlay`} className="hidden rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/70 transition hover:border-cyan-200/30 hover:text-cyan-100 sm:inline-flex">OBS-Tools</a>
						<a href={tournamentUrl} className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-lime-300/10">Turnier</a>
					</nav>
				</div>
			</header>

			<main id="main-content" tabIndex={-1} className="relative z-10">{children}</main>

			<footer className="relative z-10 border-t border-white/8 px-5 py-7 text-sm text-emerald-100/45">
				<div className="mx-auto w-full max-w-7xl">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span>Discord, Riot, Twitch und Stream-Tools an einem Ort.</span>
						<a href={apexUrl} className="font-bold text-lime-200/75 hover:text-lime-100">Zurück zu lauchgruen.de</a>
					</div>
					<RiotDisclaimer productName="Lauchgruen Overlay Builder" className="mt-4 max-w-5xl border-t border-white/8 pt-4 text-[10px] leading-5 text-emerald-100/32" />
				</div>
			</footer>
		</div>
	);
}
