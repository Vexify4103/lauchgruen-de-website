import type { Metadata } from "next";
import { ClipsArchive } from "./ClipsArchive";
import { SiteShell } from "@/components/site/SiteShell";
import { PageIntro } from "@/components/site/PageIntro";
import { headers } from "next/headers";
import { getSiteUrls } from "@/lib/site-urls";

export const metadata: Metadata = {
	title: "Clips",
	description: "Aktuelle Highlights und beliebte Twitch-Clips von Lauchgruen.",
};

export default async function ClipsPage() {
	const urls = getSiteUrls((await headers()).get("host"));
	return (
		<SiteShell apexUrl={urls.apex} tournamentUrl={urls.tournament} brand="clips">
			<section className="page-section">
				<PageIntro kicker="Direkt aus dem Stream" title="Momente, die bleiben.">
					Neue Highlights, alte Klassiker und genau die Szenen, die der Chat nicht vergessen wollte. Direkt von Twitch gesammelt.
				</PageIntro>
				<ClipsArchive />
			</section>
		</SiteShell>
	);
}
