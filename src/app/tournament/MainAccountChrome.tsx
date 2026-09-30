import type { ReactNode } from "react";
import { SiteShell } from "@/components/site/SiteShell";

export function MainAccountChrome({ children, apexUrl, tournamentUrl }: { children: ReactNode; apexUrl: string; tournamentUrl: string }) {
	return (
		<SiteShell apexUrl={apexUrl} tournamentUrl={tournamentUrl} brand="konto">
			{children}
		</SiteShell>
	);
}
