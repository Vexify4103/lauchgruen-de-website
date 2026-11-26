import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteShell } from "@/components/site/SiteShell";
import { getSiteUrls } from "@/lib/site-urls";

export const metadata: Metadata = {
	title: { default: "Win Challenge", template: "%s | Win Challenge" },
	description: "Zweierteams spielen eine feste Liste an Spielen durch. Wer zuerst alles geschafft hat, gewinnt.",
};

export default async function WinChallengeLayout({ children }: { children: React.ReactNode }) {
	const requestHeaders = await headers();
	const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "lauchgruen.de";
	const urls = getSiteUrls(host);
	return (
		<SiteShell apexUrl={urls.apex} tournamentUrl={urls.tournament} brand="winchallenge">
			<div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">{children}</div>
		</SiteShell>
	);
}
