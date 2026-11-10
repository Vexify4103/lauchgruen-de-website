"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { TournamentHeroData, TournamentSubnavItem } from "@/lib/tournament-presentation";
import { TournamentLink as Link } from "./TournamentLink";

function relativePath(path: string) {
	return path.replace(/^\/tournament(?=\/|$)/, "") || "/";
}

/** Same size on every hub tab, so the tab bar below never jumps. */
export function TournamentHero({ hero }: { hero: TournamentHeroData }) {
	return (
		<section className="tournament-hero is-compact" aria-labelledby="tournament-hero-title">
			<div className="tournament-hero-mark">
				<Image src="/tournament-bear-mark.png" alt="" width={170} height={170} priority unoptimized />
			</div>
			<div className="tournament-hero-copy min-w-0">
				<p className="eyebrow" data-tone={hero.eyebrow.tone === "live" ? "live" : undefined}>
					<i />
					{hero.eyebrow.label}
				</p>
				<h1 id="tournament-hero-title">{hero.name}</h1>
				<p className="line-clamp-2">{hero.tagline}</p>
				<ul className="tournament-pills" aria-label="Eckdaten">
					{hero.pills.map((pill) => (
						<li key={pill}>{pill}</li>
					))}
				</ul>
			</div>
			<div className="hero-side-action">
				<strong>
					{hero.side.value}
					<small> {hero.side.unit}</small>
				</strong>
				{hero.side.cta ? (
					<Link href={hero.side.cta.href} className={`button ${hero.side.cta.tone}`}>
						{hero.side.cta.label} <span aria-hidden="true">↗</span>
					</Link>
				) : null}
				{hero.side.note ? <small>{hero.side.note}</small> : null}
			</div>
		</section>
	);
}

export function TournamentSubnav({ items }: { items: TournamentSubnavItem[] }) {
	const pathname = relativePath(usePathname());
	return (
		<nav className="tournament-subnav" aria-label="Turnierseiten">
			{items.map((item) => {
				const target = relativePath(item.href);
				const current = target === "/" ? pathname === "/" : pathname === target || pathname.startsWith(`${target}/`);
				return (
					<Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} data-live={item.live ? "true" : undefined}>
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
