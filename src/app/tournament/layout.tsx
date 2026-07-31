import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getSiteUrls } from "@/lib/site-urls";
import { areTournamentApplicationsOpen } from "@/lib/tournament-application-deadline";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { isTournamentHost } from "@/lib/tournament-url";
import { TournamentAccountControl } from "./TournamentAccountControl";
import { TournamentChrome } from "./TournamentChrome";
import { MainAccountChrome } from "./MainAccountChrome";
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
	{ href: "/tournament/stage", label: "Gruppen" },
	{ href: "/tournament/playoffs", label: "Playoffs" },
];

const ultimateBraveryNavItems = [
	{ href: "/tournament", label: "Übersicht" },
	{ href: "/tournament/apply", label: "Bewerben" },
	{ href: "/tournament/teams", label: "Teams" },
	{ href: "/tournament/live", label: "Live" },
	{ href: "/tournament/schedule", label: "Zeitplan" },
	{ href: "/tournament/stage", label: "Gruppen" },
	{ href: "/tournament/playoffs", label: "Bracket" },
];

const teaserNavItems = [
	{ href: "/tournament", label: "Übersicht" },
	{ href: "/tournament/teams", label: "Teams", disabled: true },
	{ href: "/tournament/live", label: "Live", disabled: true },
	{ href: "/tournament/schedule", label: "Zeitplan", disabled: true },
	{ href: "/tournament/stage", label: "Gruppen" },
	{ href: "/tournament/playoffs", label: "Playoffs" },
];

const registrationNavItems = [
	{ href: "/tournament", label: "Übersicht" },
	{ href: "/tournament/apply", label: "Bewerben" },
	{ href: "/tournament/teams", label: "Teams", disabled: true },
	{ href: "/tournament/live", label: "Live", disabled: true },
	{ href: "/tournament/schedule", label: "Zeitplan", disabled: true },
	{ href: "/tournament/stage", label: "Gruppen" },
	{ href: "/tournament/playoffs", label: "Playoffs" },
];

export const metadata: Metadata = {
	title: "Ultimate Bravery",
	description: "Lauchgruen Ultimate-Bravery-Turnier mit zufälligen Champions, Builds, Runen und Summoner Spells.",
	openGraph: {
		type: "website",
		locale: "de_DE",
		title: "Ultimate Bravery · Lauchgruen Community-Turnier",
		description: "Zufällige Champions, Builds, Runen und Summoner Spells am 04. und 05. September 2026.",
		url: "https://tournament.lauchgruen.de",
		images: [{ url: "/bear-logo.png", width: 512, height: 512, alt: "Lauchgruen Ultimate Bravery" }],
	},
};

export default async function TournamentLayout({ children }: { children: ReactNode }) {
	const host = (await headers()).get("host");
	const hostname = (host ?? "").split(":")[0].toLowerCase();
	const siteUrls = getSiteUrls(host);
	if (["lauchgruen.de", "www.lauchgruen.de", "lauchgruen.localhost", "www.lauchgruen.localhost"].includes(hostname)) {
		return <MainAccountChrome apexUrl={siteUrls.apex} tournamentUrl={siteUrls.tournament}>{children}</MainAccountChrome>;
	}
	const [settings, session] = await Promise.all([getTournamentSettings(), auth()]);
	const cleanUrls = isTournamentHost(host);
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
	const applicationsOpen = areTournamentApplicationsOpen(
		settings.applicationsOpen,
		new Date(),
		settings.applicationDeadlineOverride,
		settings.applicationDeadline,
		settings.applicationOpenAt
	);
	const tournamentStatus =
		settings.activeTournament.mode === "live"
			? "Live"
			: settings.activeTournament.mode === "paused"
				? "Pausiert"
				: settings.activeTournament.mode === "registration"
					? "Anmeldung"
					: settings.activeTournament.mode === "teaser"
						? "Ankündigung"
						: "Vorbereitung";
	const account = discordId
		? {
				discordHandle: session.user.discordHandle ?? session.user.name ?? "Discord",
				discordAvatar: session.user.discordAvatar,
				discordInGuild: session.user.discordInGuild,
				isOwner,
			}
		: null;
	const stageLabel = settings.ultimateBravery.dayOneFormat === "swiss" ? "Swiss Stage" : settings.ultimateBravery.dayOneFormat === "groups" ? "Gruppen" : "Stage";
	const selectedNavItems =
		settings.activeTournament.mode === "live"
			? settings.activeTournament.id === "ultimate-bravery"
				? ultimateBraveryNavItems
				: navItems
			: settings.activeTournament.mode === "registration"
				? registrationNavItems
				: teaserNavItems;
	const dynamicNavItems = selectedNavItems.map((item) => {
		const itemDisabled = "disabled" in item ? item.disabled === true : false;
		if (item.href === "/tournament/stage") return { ...item, label: stageLabel, disabled: itemDisabled || settings.ultimateBravery.dayOneFormat === "undecided" };
		if (item.href === "/tournament/playoffs") return { ...item, disabled: itemDisabled || settings.ultimateBravery.format === "undecided" };
		return item;
	});

	return (
		<AdminConflictProvider>
			<UnsavedChangesProvider>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{
						__html: JSON.stringify({
							"@context": "https://schema.org",
							"@type": "SportsEvent",
							name: "Lauchgruen Ultimate Bravery",
							startDate: "2026-09-04T18:00:00+02:00",
							endDate: "2026-09-05T23:59:00+02:00",
							eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
							eventStatus: "https://schema.org/EventScheduled",
							location: { "@type": "VirtualLocation", url: "https://tournament.lauchgruen.de" },
							organizer: { "@type": "Person", name: "Lauchgruen", url: "https://lauchgruen.de" },
						}),
					}}
				/>
				<TournamentChrome
					navItems={dynamicNavItems}
					applicationsOpen={applicationsOpen}
					tournamentStatus={tournamentStatus}
					apexUrl={siteUrls.apex}
					cleanUrls={cleanUrls}
					accountControl={<TournamentAccountControl account={account} accountUrl={`${siteUrls.apex}/me?from=tournament`} />}
					compactAccountControl={<TournamentAccountControl account={account} accountUrl={`${siteUrls.apex}/me?from=tournament`} compact />}
					footerTournamentLabel={
						settings.activeTournament.id === "ultimate-bravery"
							? "Ultimate Bravery am 04.09. und 05.09.2026, jeweils ab 18:00 Uhr."
							: "Kunterbuntes A-Z Turnier ist Lucas Community-Turnier am 19.06. und 20.06.2026."
					}
				>
					{children}
				</TournamentChrome>
			</UnsavedChangesProvider>
		</AdminConflictProvider>
	);
}
