import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { ApexHeader } from "@/components/site/ApexHeader";

export function MainAccountChrome({ children, apexUrl, tournamentUrl }: { children: ReactNode; apexUrl: string; tournamentUrl: string }) {
	return (
		<div className="relative min-h-screen overflow-hidden bg-[#020b07] text-emerald-50">
			<a href="#main-content" className="skip-link">
				Zum Inhalt
			</a>
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_4%,rgba(163,230,53,0.12),transparent_29%),radial-gradient(circle_at_92%_26%,rgba(34,211,238,0.09),transparent_27%),linear-gradient(155deg,#020b07_0%,#04140c_48%,#020906_100%)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]"
			/>

			<ApexHeader apexUrl={apexUrl} tournamentUrl={tournamentUrl} brand="konto" />

			<main id="main-content" tabIndex={-1} className="relative z-10">
				{children}
			</main>

			<SiteFooter apexUrl={apexUrl} tournamentUrl={tournamentUrl} />
		</div>
	);
}
