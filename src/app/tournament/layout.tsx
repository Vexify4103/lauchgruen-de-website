import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getSiteUrls } from "@/lib/site-urls";
import { tournament } from "@/lib/tournament-data";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { isTournamentHost } from "@/lib/tournament-url";
import { TournamentAccountControl } from "./TournamentAccountControl";
import { TournamentChrome } from "./TournamentChrome";

const navItems = [
  { href: "/tournament", label: "Übersicht" },
  { href: "/tournament/apply", label: "Bewerben" },
  { href: "/tournament/teams", label: "Teams" },
  { href: "/tournament/schedule", label: "Zeitplan" },
  { href: "/tournament/pools", label: "Pools" },
  { href: "/tournament/captain", label: "Captain" },
  { href: "/tournament/groups", label: "Gruppen" },
  { href: "/tournament/playoffs", label: "Playoffs" },
];

export const metadata: Metadata = {
  title: `${tournament.name} | lauchgruen`,
  description:
    "Kunterbuntes A-Z League-of-Legends-Turnier mit Bewerbung, Teams, Gruppenphase und Endbracket.",
};

export default async function TournamentLayout({ children }: { children: ReactNode }) {
  const host = (await headers()).get("host");
  const [settings, session] = await Promise.all([getTournamentSettings(), auth()]);
  const siteUrls = getSiteUrls(host);
  const cleanUrls = isTournamentHost(host);
  const discordId = session?.user?.discordId;
  const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
  const account =
    discordId
      ? {
          discordHandle: session.user.discordHandle ?? session.user.name ?? "Discord",
          discordAvatar: session.user.discordAvatar,
          discordInGuild: session.user.discordInGuild,
          isOwner,
        }
      : null;

  return (
    <TournamentChrome
      navItems={navItems}
      applicationsOpen={settings.applicationsOpen}
      tournamentLive={settings.tournamentLive}
      apexUrl={siteUrls.apex}
      cleanUrls={cleanUrls}
      accountControl={<TournamentAccountControl account={account} cleanUrls={cleanUrls} />}
      compactAccountControl={<TournamentAccountControl account={account} cleanUrls={cleanUrls} compact />}
    >
      {children}
    </TournamentChrome>
  );
}
