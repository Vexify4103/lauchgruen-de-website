import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getSiteUrls } from "@/lib/site-urls";
import { areTournamentApplicationsOpen } from "@/lib/tournament-application-deadline";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { getRosterPublicationStatus } from "@/lib/roster";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { isTournamentHost } from "@/lib/tournament-url";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getMatchControlContext } from "@/lib/match-control";
import { resolveTournamentCompletion } from "@/lib/tournament-completion";
import { buildTournamentHero, buildTournamentSubnav, formatTournamentDay } from "@/lib/tournament-presentation";
import { TOURNAMENT_KIND_LABELS } from "@/lib/tournament-kind";
import type { SiteNavItem } from "@/components/site/SiteHeader";
import { TournamentAccountControl } from "./TournamentAccountControl";
import { TournamentChrome } from "./TournamentChrome";
import { MainAccountChrome } from "./MainAccountChrome";
import { AdminConflictProvider } from "@/components/AdminConflictProvider";
import { UnsavedChangesProvider } from "@/components/UnsavedChangesProvider";

export async function generateMetadata(): Promise<Metadata> {
	const settings = await getTournamentSettings();
	const { name, kind } = settings.activeTournament;
	const day = formatTournamentDay(settings.ultimateBravery.startAt, false);
	const description = `${name}: Lauchgruen Community-Turnier (${TOURNAMENT_KIND_LABELS[kind]})${day ? ` ab ${day}` : ""}.`;
	return {
		title: { default: name, template: `%s · ${name}` },
		description,
		openGraph: {
			type: "website",
			locale: "de_DE",
			title: `${name} · Lauchgruen Community-Turnier`,
			description,
			url: "https://tournament.lauchgruen.de",
			images: [{ url: "/bear-logo.png", width: 512, height: 512, alt: `Lauchgruen ${name}` }],
		},
	};
}

export default async function TournamentLayout({ children }: { children: ReactNode }) {
	const host = (await headers()).get("host");
	const hostname = (host ?? "").split(":")[0].toLowerCase();
	const siteUrls = getSiteUrls(host);
	if (["lauchgruen.de", "www.lauchgruen.de", "lauchgruen.localhost", "www.lauchgruen.localhost"].includes(hostname)) {
		return (
			<MainAccountChrome apexUrl={siteUrls.apex} tournamentUrl={siteUrls.tournament}>
				{children}
			</MainAccountChrome>
		);
	}
	const [settings, session, rosterPublication, context] = await Promise.all([getTournamentSettings(), auth(), getRosterPublicationStatus(), getTournamentContext()]);
	const active = settings.activeTournament;
	const cleanUrls = isTournamentHost(host);
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
	const isCaptain = Boolean(discordId && context.teams.some((team) => team.captainRef?.discordId === discordId));
	const applicationsOpen = areTournamentApplicationsOpen(
		settings.applicationsOpen,
		new Date(),
		settings.applicationDeadlineOverride,
		settings.applicationDeadline,
		settings.applicationOpenAt
	);
	const completion = active.mode === "finished" ? resolveTournamentCompletion((await getMatchControlContext()).matches) : null;
	const hero = buildTournamentHero({
		settings,
		teamCount: rosterPublication.published ? rosterPublication.teamCount : 0,
		applicationsOpen,
		championTeamName: completion?.championTeamName,
	});
	const subnavItems = buildTournamentSubnav({ settings, rosterPublished: rosterPublication.published, isCaptain });
	const navItems: SiteNavItem[] = [
		{ href: "/tournament", label: "Turnier", matches: ["/tournament/teams", "/tournament/stage", "/tournament/playoffs", "/tournament/schedule", "/tournament/live"] },
		{ href: "/tournament/winners", label: "Archiv", matches: ["/tournament/archive"] },
		{ href: "/tournament/terms", label: "Regeln" },
		...(isOwner ? [{ href: "/tournament/admin", label: "Admin" }] : []),
		{ href: `${siteUrls.apex}/`, label: "lauchgruen.de", external: true },
	];
	const account = discordId
		? {
				discordHandle: session.user.discordHandle ?? session.user.name ?? "Discord",
				discordAvatar: session.user.discordAvatar,
				discordInGuild: session.user.discordInGuild,
				isOwner,
			}
		: null;
	const firstDay = formatTournamentDay(settings.ultimateBravery.startAt);
	const secondDay = formatTournamentDay(settings.ultimateBravery.dayTwoStartAt);

	return (
		<AdminConflictProvider>
			<UnsavedChangesProvider>
				{settings.ultimateBravery.startAt ? (
					<script
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify({
								"@context": "https://schema.org",
								"@type": "SportsEvent",
								name: `Lauchgruen ${active.name}`,
								startDate: settings.ultimateBravery.startAt,
								...(settings.ultimateBravery.dayTwoStartAt ? { endDate: settings.ultimateBravery.dayTwoStartAt } : {}),
								eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
								eventStatus: active.mode === "finished" ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled",
								location: { "@type": "VirtualLocation", url: "https://tournament.lauchgruen.de" },
								organizer: { "@type": "Person", name: "Lauchgruen", url: "https://lauchgruen.de" },
							}),
						}}
					/>
				) : null}
				<TournamentChrome
					applicationsOpen={applicationsOpen}
					navItems={navItems}
					hero={hero}
					subnavItems={subnavItems}
					status={hero.eyebrow}
					apexUrl={siteUrls.apex}
					cleanUrls={cleanUrls}
					accountControl={<TournamentAccountControl account={account} accountUrl={`${siteUrls.apex}/me?from=tournament`} />}
					compactAccountControl={<TournamentAccountControl account={account} accountUrl={`${siteUrls.apex}/me?from=tournament`} compact />}
					footerTournamentLabel={
						firstDay ? `${active.name}${secondDay ? ` am ${firstDay} und ${secondDay}` : ` ab ${firstDay}`}.` : `${active.name} · Termin wird angekündigt.`
					}
				>
					{children}
				</TournamentChrome>
			</UnsavedChangesProvider>
		</AdminConflictProvider>
	);
}
