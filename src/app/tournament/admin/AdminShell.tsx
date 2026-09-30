"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TournamentLink as Link } from "../TournamentLink";

export type AdminNavCounts = { liveMatches: number; applications: number; attention: number };

const PAGE_HEADS: Array<{ match: RegExp; eyebrow: string; title: string }> = [
	{ match: /^\/admin\/live/, eyebrow: "Operativer Betrieb", title: "Live-Cockpit" },
	{ match: /^\/admin\/applicants/, eyebrow: "Teilnehmer", title: "Bewerbungen" },
	{ match: /^\/admin\/roster/, eyebrow: "Teambau", title: "Roster & Seeding" },
	{ match: /^\/admin\/status/, eyebrow: "Betrieb", title: "Systemstatus" },
	{ match: /^\/admin\/swiss-test/, eyebrow: "Werkzeuge", title: "Swiss-Test" },
	{ match: /^\/admin\/matches\//, eyebrow: "Match Desk", title: "Match-Steuerung" },
];

function relativePath(path: string) {
	return path.replace(/^\/tournament(?=\/|$)/, "") || "/";
}

export function AdminShell({
	tournamentName,
	user,
	counts,
	showSwissTest,
	accountUrl,
	children,
}: {
	tournamentName: string;
	user: { name: string; handle: string };
	counts: AdminNavCounts;
	showSwissTest: boolean;
	accountUrl: string;
	children: ReactNode;
}) {
	const path = relativePath(usePathname());
	const head = PAGE_HEADS.find((entry) => entry.match.test(path)) ?? { eyebrow: `${tournamentName} · Control Room`, title: "Turniersteuerung" };
	const matchId = path.startsWith("/admin/matches/") ? decodeURIComponent(path.split("/")[3] ?? "") : null;
	const nav: Array<{ href: string; label: string; count?: number; exact?: boolean } | "divider"> = [
		{ href: "/tournament/admin", label: "Übersicht", count: counts.attention, exact: true },
		{ href: "/tournament/admin/live", label: "Live-Cockpit", count: counts.liveMatches },
		{ href: "/tournament/admin/applicants", label: "Bewerbungen", count: counts.applications },
		{ href: "/tournament/admin/roster", label: "Roster & Seeding" },
		"divider",
		{ href: "/tournament/admin/status", label: "Systemstatus" },
		...(showSwissTest ? [{ href: "/tournament/admin/swiss-test", label: "Swiss-Test" }] : []),
	];

	return (
		<div className="admin-page">
			<aside className="admin-sidebar" aria-label="Admin-Navigation">
				<Link className="wordmark" href="/tournament/admin" aria-label="Control Room – Übersicht">
					<span className="wordmark-orb">
						<Image src="/tournament-bear-mark.png" alt="" width={42} height={42} priority unoptimized />
					</span>
					<span translate="no">
						control<strong>room</strong>
					</span>
				</Link>
				<nav>
					{nav.map((item, index) => {
						if (item === "divider") return <hr key={`divider-${index}`} />;
						const target = relativePath(item.href);
						const current = item.exact ? path === target : path === target || path.startsWith(`${target}/`);
						return (
							<Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
								<span>{item.label}</span>
								{item.count ? <b aria-label={`${item.count} offen`}>{item.count}</b> : null}
							</Link>
						);
					})}
					<hr />
					<Link href="/tournament">
						<span>Öffentliche Seite</span>
						<span aria-hidden="true">↗</span>
					</Link>
				</nav>
				<div>
					<small>Angemeldet als</small>
					<strong>{user.name}</strong>
					<span>@{user.handle}</span>
				</div>
			</aside>
			<div className="admin-content">
				<header className="admin-page-head">
					<div className="min-w-0">
						<p>{matchId ? `${head.eyebrow} · ${matchId}` : head.eyebrow}</p>
						<h1>{head.title}</h1>
					</div>
					<nav aria-label="Schnellzugriff">
						<Link href="/tournament" className="button ghost small">
							Turnierseite <span aria-hidden="true">↗</span>
						</Link>
						<a href={accountUrl} className="button ghost small">
							Mein Konto <span aria-hidden="true">↗</span>
						</a>
					</nav>
				</header>
				{children}
			</div>
		</div>
	);
}
