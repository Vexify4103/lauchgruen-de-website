"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { TournamentHeroData, TournamentSubnavItem } from "@/lib/tournament-presentation";
import { TournamentLink as Link } from "./TournamentLink";

function relativePath(path: string) {
	return path.replace(/^\/tournament(?=\/|$)/, "") || "/";
}

export function TournamentHero({ hero, compact = false }: { hero: TournamentHeroData; compact?: boolean }) {
	return (
		<section className={`tournament-hero ${compact ? "is-compact" : ""}`} aria-labelledby="tournament-hero-title">
			<div className="tournament-hero-mark">
				<Image src="/tournament-bear-mark.png" alt="" width={170} height={170} priority unoptimized />
			</div>
			<div className="tournament-hero-copy min-w-0">
				<p className="eyebrow" data-tone={hero.eyebrow.tone === "live" ? "live" : undefined}>
					<i />
					{hero.eyebrow.label}
				</p>
				{compact ? (
					<p id="tournament-hero-title" className="m-0 font-display text-[clamp(30px,4vw,48px)] font-bold leading-[0.95] tracking-[-0.06em] text-[var(--text)]">
						{hero.name}
					</p>
				) : (
					<h1 id="tournament-hero-title">{hero.name}</h1>
				)}
				{compact ? null : <p>{hero.tagline}</p>}
				{compact ? null : (
					<ul className="tournament-pills" aria-label="Eckdaten">
						{hero.pills.map((pill) => (
							<li key={pill}>{pill}</li>
						))}
					</ul>
				)}
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
