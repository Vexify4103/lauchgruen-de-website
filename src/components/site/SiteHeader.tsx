"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { TournamentLink } from "@/app/tournament/TournamentLink";

export type SiteNavItem = {
	href: string;
	label: string;
	/** Links to another host (apex site, Twitch); rendered as a plain anchor. */
	external?: boolean;
	/** Extra path prefixes that should also mark this item as current. */
	matches?: string[];
};

function normalizePath(path: string) {
	return path.replace(/^\/tournament(?=\/|$)/, "") || "/";
}

function isCurrent(pathname: string, item: SiteNavItem) {
	if (item.external) return false;
	const current = normalizePath(pathname);
	const target = normalizePath(item.href);
	if (target === "/") return current === "/" || (item.matches ?? []).includes(current);
	return [target, ...(item.matches ?? []).map(normalizePath)].some((prefix) => current === prefix || current.startsWith(`${prefix}/`));
}

export function SiteHeader({
	homeHref,
	homeLabel,
	brand,
	navItems,
	status,
	account,
}: {
	homeHref: string;
	homeLabel: string;
	/** Second word of the wordmark, e.g. "turnier". */
	brand?: string;
	navItems: SiteNavItem[];
	status?: ReactNode;
	account?: ReactNode;
}) {
	const pathname = usePathname();
	const navId = useId();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<header className="site-header">
			<TournamentLink className="wordmark" href={homeHref} aria-label={homeLabel}>
				<span className="wordmark-orb">
					<Image src="/tournament-bear-mark.png" alt="" width={42} height={42} priority unoptimized />
				</span>
				<span translate="no">
					lauch<strong>gruen</strong>
					{brand ? <span className="ml-2 font-sans text-sm font-bold tracking-normal text-[var(--muted)]">{brand}</span> : null}
				</span>
			</TournamentLink>
			<nav id={navId} className={open ? "site-nav is-open" : "site-nav"} aria-label="Hauptnavigation">
				{navItems.map((item) =>
					item.external ? (
						<a key={item.href} href={item.href} onClick={() => setOpen(false)}>
							{item.label}
							<span aria-hidden="true"> ↗</span>
						</a>
					) : (
						<TournamentLink key={item.href} href={item.href} aria-current={isCurrent(pathname, item) ? "page" : undefined} onClick={() => setOpen(false)}>
							{item.label}
						</TournamentLink>
					)
				)}
			</nav>
			<div className="header-actions">
				{status}
				{account}
				<button className="menu-button" type="button" aria-label="Menü" aria-controls={navId} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
					<span />
					<span />
				</button>
			</div>
		</header>
	);
}
