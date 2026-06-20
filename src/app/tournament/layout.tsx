import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getSiteUrls } from "@/lib/site-urls";
import { areTournamentApplicationsOpen } from "@/lib/tournament-application-deadline";
import { tournament } from "@/lib/tournament-data";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { isTournamentHost } from "@/lib/tournament-url";
import { TournamentAccountControl } from "./TournamentAccountControl";
import { TournamentChrome } from "./TournamentChrome";
import { AdminConflictProvider } from "@/components/AdminConflictProvider";
import { UnsavedChangesProvider } from "@/components/UnsavedChangesProvider";

const navItems = [
	{ href: "/tournament", label: "Übersicht" },
	{ href: "/tournament/apply", label: "Bewerben" },
	{ href: "/tournament/teams", label: "Teams" },
	{ href: "/tournament/live", label: "Live" },
	{ href: "/tournament/schedule", label: "Zeitplan" },
	{ href: "/tournament/pools", label: "Pools" },
	{ href: "/tournament/captain", label: "Captain" },
	{ href: "/tournament/groups", label: "Gruppen" },
	{ href: "/tournament/playoffs", label: "Playoffs" },
];

const teaserNavItems = [
	{ href: "/tournament", label: "Übersicht" },
	{ href: "/tournament/teams", label: "Teams", disabled: true },
	{ href: "/tournament/live", label: "Live", disabled: true },
	{ href: "/tournament/schedule", label: "Zeitplan", disabled: true },
	{ href: "/tournament/groups", label: "Gruppen", disabled: true },
	{ href: "/tournament/playoffs", label: "Playoffs", disabled: true },
];

export const metadata: Metadata = {
	title: `${tournament.name} | lauchgruen`,
	description: "Kunterbuntes A-Z League-of-Legends-Turnier mit Bewerbung, Teams, Gruppenphase und Endbracket.",
};

export default async function TournamentLayout({ children }: { children: ReactNode }) {
	const host = (await headers()).get("host");
	const [settings, session] = await Promise.all([getTournamentSettings(), auth()]);
	const siteUrls = getSiteUrls(host);
	const cleanUrls = isTournamentHost(host);
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
	const applicationsOpen = areTournamentApplicationsOpen(settings.applicationsOpen, new Date(), settings.applicationDeadlineOverride, settings.applicationDeadline);
	const tournamentStatus = settings.tournamentLive ? "Live" : settings.activeTournament.mode === "teaser" ? "Ankündigung" : applicationsOpen ? "Anmeldung" : "Vorbereitung";
	const account = discordId
		? {
				discordHandle: session.user.discordHandle ?? session.user.name ?? "Discord",
				discordAvatar: session.user.discordAvatar,
				discordInGuild: session.user.discordInGuild,
				isOwner,
			}
		: null;

	return (
		<AdminConflictProvider>
			<UnsavedChangesProvider>
				<TournamentChrome
					navItems={settings.activeTournament.mode === "teaser" ? teaserNavItems : navItems}
					applicationsOpen={applicationsOpen}
					tournamentStatus={tournamentStatus}
					apexUrl={siteUrls.apex}
					cleanUrls={cleanUrls}
					accountControl={<TournamentAccountControl account={account} cleanUrls={cleanUrls} />}
					compactAccountControl={<TournamentAccountControl account={account} cleanUrls={cleanUrls} compact />}
					footerTournamentLabel={
						settings.activeTournament.mode === "teaser"
							? "Ultimate Bravery ist das nächste Lauchgruen Community-Turnier. Details folgen."
							: "Kunterbuntes A-Z Turnier ist Lucas Community-Turnier am 19.06. und 20.06.2026."
					}
				>
					{children}
				</TournamentChrome>
			</UnsavedChangesProvider>
		</AdminConflictProvider>
	);
}
