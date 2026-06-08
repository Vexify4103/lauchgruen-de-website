import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getSiteUrls } from "@/lib/site-urls";
import { tournament } from "@/lib/tournament-data";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { isTournamentHost } from "@/lib/tournament-url";
import { TournamentChrome } from "./TournamentChrome";

const navItems = [
  { href: "/tournament", label: "Übersicht" },
  { href: "/tournament/apply", label: "Bewerben" },
  { href: "/tournament/teams", label: "Teams" },
  { href: "/tournament/schedule", label: "Zeitplan" },
  { href: "/tournament/pools", label: "Pools" },
  { href: "/tournament/me", label: "Mein Status" },
  { href: "/tournament/captain", label: "Captain" },
  { href: "/tournament/groups", label: "Gruppen" },
  { href: "/tournament/playoffs", label: "Playoffs" },
  { href: "/tournament/admin", label: "Admin" },
];

export const metadata: Metadata = {
  title: `${tournament.name} | lauchgruen`,
  description:
    "Kunterbuntes A-Z League-of-Legends-Turnier mit Bewerbung, Teams, Gruppenphase und Endbracket.",
};

export default async function TournamentLayout({ children }: { children: ReactNode }) {
  const host = (await headers()).get("host");
  const siteUrls = getSiteUrls(host);
  const settings = await getTournamentSettings();
  const cleanUrls = isTournamentHost(host);

  return (
    <TournamentChrome
      navItems={navItems}
      applicationsOpen={settings.applicationsOpen}
      tournamentLive={settings.tournamentLive}
      apexUrl={siteUrls.apex}
      cleanUrls={cleanUrls}
    >
      {children}
    </TournamentChrome>
  );
}
