import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getMatchControlContext } from "@/lib/match-control";
import { getSiteUrls } from "@/lib/site-urls";
import { usesFlexibleEngine } from "@/lib/tournament-kind";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { listApplications, TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { DiscordSignInButton } from "../DiscordSignInButton";
import { AdminShell } from "./AdminShell";

export const metadata: Metadata = { title: "Control Room", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return (
			<AdminGate eyebrow="Privater Bereich" title="Admin-Login erforderlich.">
				<p>Der Control Room ist nur für die Turnierleitung. Melde dich mit deinem Owner-Discord-Account an.</p>
				<DiscordSignInButton redirectTo="/tournament/admin" pendingLabel="Weiter zu Discord…" className="button primary mt-6">
					Mit Discord anmelden
				</DiscordSignInButton>
			</AdminGate>
		);
	}
	if (!TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return (
			<AdminGate eyebrow="Kein Zugriff" title="Dieser Discord-Account ist kein Admin.">
				<p>Nur die hinterlegten Owner-Accounts können Turniere verwalten.</p>
			</AdminGate>
		);
	}

	const [settings, control, applications, requestHeaders] = await Promise.all([getTournamentSettings(), getMatchControlContext(), listApplications(), headers()]);
	const playable = control.matches.filter((match) => match.teamAName && match.teamBName);
	const counts = {
		liveMatches: playable.filter((match) => match.status === "Live" || match.status === "Pending").length,
		applications: applications.length,
		attention: playable.filter((match) => match.status === "Finished" && (match.scoreA === undefined || match.scoreB === undefined)).length,
	};
	return (
		<AdminShell
			tournamentName={settings.activeTournament.name}
			user={{ name: session.user.name ?? session.user.discordHandle ?? "Admin", handle: session.user.discordHandle ?? discordId }}
			counts={counts}
			showSwissTest={usesFlexibleEngine(settings.activeTournament) && settings.ultimateBravery.dayOneFormat === "swiss"}
			accountUrl={`${getSiteUrls(requestHeaders.get("host")).apex}/me?from=tournament`}
		>
			{children}
		</AdminShell>
	);
}

function AdminGate({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
	return (
		<div className="inner-page grid place-items-center px-4">
			<section className="content-panel my-24 max-w-xl text-center">
				<p className="eyebrow justify-center">
					<i />
					{eyebrow}
				</p>
				<h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
				<div className="mt-4 text-sm leading-7 text-[var(--muted)]">{children}</div>
			</section>
		</div>
	);
}
