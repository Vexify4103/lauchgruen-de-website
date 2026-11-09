"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

export type FearlessGame = {
	key: string;
	round: string;
	opponent: string | null;
	own: string[];
	faced: string[];
};

export type FearlessTeam = {
	id: string;
	name: string;
	ownCount: number;
	facedCount: number;
	games: FearlessGame[];
};

type Props = {
	teams: FearlessTeam[];
	images: Record<string, string>;
	showFaced: boolean;
};

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]/gi, "")
		.toLowerCase();
}

export function FearlessBoard({ teams, images, showFaced }: Props) {
	const [query, setQuery] = useState("");
	const needle = normalize(query);

	// Champions matching the search (name prefix first), and which teams have each of them locked.
	const hits = useMemo(() => {
		if (!needle) return [];
		return Object.keys(images)
			.filter((name) => normalize(name).includes(needle))
			.sort((a, b) => Number(!normalize(a).startsWith(needle)) - Number(!normalize(b).startsWith(needle)) || a.localeCompare(b, "de"))
			.slice(0, 4)
			.map((name) => ({
				name,
				locked: teams.filter((team) => team.games.some((game) => game.own.includes(name) || game.faced.includes(name))).map((team) => team.name),
			}));
	}, [needle, images, teams]);

	const matches = (name: string) => !needle || normalize(name).includes(needle);

	return (
		<div className="grid gap-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<label className="relative block w-full sm:max-w-xs">
					<span className="sr-only">Champion suchen</span>
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Champion suchen…"
						autoComplete="off"
						spellCheck={false}
						className="h-10 w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)]"
					/>
				</label>
				{showFaced ? (
					<p className="flex items-center gap-4 text-xs text-[var(--muted)]">
						<span className="inline-flex items-center gap-1.5">
							<i aria-hidden className="size-2.5 rounded-sm bg-[var(--text)] opacity-80" /> Eigene Picks
						</span>
						<span className="inline-flex items-center gap-1.5">
							<i aria-hidden className="size-2.5 rounded-sm bg-[var(--text)] opacity-25" /> Gegner-Picks
						</span>
					</p>
				) : null}
			</div>

			{needle ? (
				<div aria-live="polite" className="grid gap-2 rounded-2xl border border-[var(--line)] bg-black/15 p-3 text-sm">
					{hits.length === 0 ? (
						<p className="text-[var(--muted)]">Kein Champion gefunden.</p>
					) : (
						hits.map((hit) => (
							<div key={hit.name} className="flex items-start gap-3">
								<span className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-[var(--line)]">
									<Image src={images[hit.name]} alt="" fill sizes="32px" className="object-cover" />
								</span>
								<div className="min-w-0">
									<div className="font-bold">{hit.name}</div>
									<div className="text-xs text-[var(--muted)]">
										{hit.locked.length === 0
											? "Für alle Teams frei."
											: hit.locked.length === teams.length
												? "Für alle Teams gesperrt."
												: `Gesperrt für ${hit.locked.join(", ")}. Frei für ${teams
														.filter((team) => !hit.locked.includes(team.name))
														.map((team) => team.name)
														.join(", ")}.`}
									</div>
								</div>
							</div>
						))
					)}
				</div>
			) : null}

			<div className="grid gap-4 lg:grid-cols-2">
				{teams.map((team) => {
					const total = team.ownCount + team.facedCount;
					return (
						<article key={team.id} id={`team-${team.id}`} className="scroll-mt-40 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-5">
							<header className="flex items-baseline justify-between gap-3">
								<h3 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">{team.name}</h3>
								<span className="shrink-0 text-xs text-[var(--muted)] tabular-nums">
									<b className="text-base font-semibold text-[var(--text)]">{total}</b> gesperrt
									{showFaced && total ? ` · ${team.ownCount} eigene` : ""}
								</span>
							</header>
							{team.games.length === 0 ? (
								<p className="mt-4 text-sm text-[var(--muted)]">Noch kein Champion verbraucht.</p>
							) : (
								<ol className="mt-4 grid gap-1" aria-label={`Gesperrte Champions von ${team.name}`}>
									{team.games.map((game) => (
										<li
											key={game.key}
											className="grid gap-1.5 border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0 sm:grid-cols-[8.5rem_1fr] sm:items-center sm:gap-3"
										>
											<div className="min-w-0 text-[11px] leading-4">
												<div className="truncate font-bold text-[var(--text)]" title={game.round}>
													{game.round}
												</div>
												{game.opponent ? <div className="truncate text-[var(--muted)]">vs {game.opponent}</div> : null}
											</div>
											<div className="flex flex-wrap items-center gap-[3px] sm:gap-1">
												{game.own.map((name) => (
													<ChampionTile key={name} name={name} image={images[name]} faded={false} dimmed={!matches(name)} />
												))}
												{game.faced.length ? <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--line-strong)] sm:mx-1" /> : null}
												{game.faced.map((name) => (
													<ChampionTile key={name} name={name} image={images[name]} faded dimmed={!matches(name)} />
												))}
											</div>
										</li>
									))}
								</ol>
							)}
						</article>
					);
				})}
			</div>
		</div>
	);
}

function ChampionTile({ name, image, faded, dimmed }: { name: string; image: string | undefined; faded: boolean; dimmed: boolean }) {
	return (
		<span
			title={faded ? `${name} · Gegner-Pick` : name}
			className={`relative size-7 shrink-0 overflow-hidden rounded-md border border-[var(--line)] bg-black/30 transition-opacity max-sm:size-6 sm:size-8 ${
				dimmed ? "opacity-15" : faded ? "opacity-45 grayscale" : ""
			}`}
		>
			{image ? <Image src={image} alt={name} fill sizes="32px" className="object-cover" /> : <span className="sr-only">{name}</span>}
		</span>
	);
}
