import type { ReactNode } from "react";
import { ApexHeader } from "./ApexHeader";
import { SiteFooter } from "@/components/SiteFooter";

export function SiteShell({
	children,
	apexUrl,
	tournamentUrl,
	brand,
	main = true,
}: {
	children: ReactNode;
	apexUrl: string;
	tournamentUrl: string;
	brand?: string;
	main?: boolean;
}) {
	return (
		<div className="site-shell">
			<a href="#main-content" className="skip-link">
				Zum Inhalt
			</a>
			<ApexHeader apexUrl={apexUrl} tournamentUrl={tournamentUrl} brand={brand} />
			{main ? (
				<main id="main-content" tabIndex={-1} className="inner-page">
					{children}
				</main>
			) : (
				children
			)}
			<SiteFooter apexUrl={apexUrl} tournamentUrl={tournamentUrl} />
		</div>
	);
}
