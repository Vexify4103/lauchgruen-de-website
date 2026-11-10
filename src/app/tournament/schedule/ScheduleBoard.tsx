"use client";

import { useMemo, useState } from "react";
import { TournamentLink as Link } from "../TournamentLink";
import { TournamentLiveStreamLinks } from "@/components/TournamentLiveStreamLinks";
import type { TournamentLiveStream } from "@/lib/tournament-live-streams";

export type ScheduleRow = {
	id: string;
	round: string;
	time: string;
	teamA: string;
	teamB: string;
	tagA?: string | null;
	tagB?: string | null;
	resolvedA: boolean;
	resolvedB: boolean;
	scoreA?: number;
	scoreB?: number;
	status: string;
	isCasted?: boolean;
	/** Extra chip, for example the A–Z pools. */
	note?: string | null;
	draftHref?: string | null;
	preview?: boolean;
	streams: TournamentLiveStream[];
};

export type ScheduleDay = {
	title: string;
	description: string;
	emptyText: string;
	batches: Array<{ label: string; time?: string; matches: ScheduleRow[] }>;
};

const STATUS: Record<string, string> = { Scheduled: "Geplant", Pending: "Champ Select", Locked: "Wartet", Live: "Live", Finished: "Beendet" };

/** Timeline of all match blocks with a team filter, so long schedules stay readable. */
export function ScheduleBoard({ days, teams }: { days: ScheduleDay[]; teams: Array<{ name: string; tag: string }> }) {
	const [team, setTeam] = useState<string | null>(null);
	const [openOnly, setOpenOnly] = useState(false);
	const visible = (row: ScheduleRow) => (!team || row.teamA === team || row.teamB === team) && (!openOnly || row.status !== "Finished");
	// The first block with an unfinished match is "now".
	const currentBlock = useMemo(() => {
		for (const day of days) for (const batch of day.batches) if (batch.matches.some((row) => row.status !== "Finished")) return `${day.title}|${batch.label}`;
		return null;
	}, [days]);

	return (
		<div className="grid gap-6">
			<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Nach Team filtern">
				<button
					type="button"
					onClick={() => setTeam(null)}
					aria-pressed={!team}
					className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${!team ? "border-[var(--accent)] text-[var(--text)]" : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"}`}
				>
					Alle Teams
				</button>
				{teams.map((entry) => (
					<button
						key={entry.name}
						type="button"
						onClick={() => setTeam((current) => (current === entry.name ? null : entry.name))}
						aria-pressed={team === entry.name}
						title={entry.name}
						className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors ${
							team === entry.name
								? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text)]"
								: "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
						}`}
					>
						{entry.tag}
					</button>
				))}
				<label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
					<input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} className="accent-[var(--accent)]" />
					Nur offene Matches
				</label>
			</div>

			{days.map((day) => {
				const batches = day.batches.map((batch) => ({ ...batch, rows: batch.matches.filter(visible) })).filter((batch) => batch.rows.length);
				return (
					<section key={day.title} aria-label={day.title} className="content-panel tight">
						<header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-3">
							<h2 className="!m-0 !text-xl">{day.title}</h2>
							<p className="m-0 text-sm text-[var(--muted)]">{day.description}</p>
						</header>
						{batches.length ? (
							<ol className="mt-2">
								{batches.map((batch) => {
									const now = currentBlock === `${day.title}|${batch.label}`;
									return (
										<li key={batch.label} className="grid gap-x-4 border-b border-[var(--line)] py-3 last:border-b-0 sm:grid-cols-[7.5rem_1fr]">
											<div className="mb-2 sm:mb-0 sm:pt-1.5">
												<div className={`text-sm font-medium ${now ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{batch.label}</div>
												<div className="text-xs text-[var(--muted)] tabular-nums">
													{now ? "Jetzt" : clockTime(batch.time ?? batch.rows[0]?.time)}
													{batch.rows.length > 1 ? ` · ${batch.rows.length} parallel` : ""}
												</div>
											</div>
											<ul className="grid gap-1.5">
												{batch.rows.map((row) => (
													<MatchRow key={row.id} row={row} highlight={team} batchLabel={batch.label} />
												))}
											</ul>
										</li>
									);
								})}
							</ol>
						) : (
							<p className="mt-4 text-sm text-[var(--muted)]">{team || openOnly ? "Keine passenden Matches." : day.emptyText}</p>
						)}
					</section>
				);
			})}
		</div>
	);
}

/** Only real clock times; labels like "Rolling Schedule" are dropped. */
function clockTime(value: string | undefined) {
	return value && /\d/.test(value) ? value : "";
}

function MatchRow({ row, highlight, batchLabel }: { row: ScheduleRow; highlight: string | null; batchLabel: string }) {
	const live = row.status === "Live" || row.preview;
	const scored = row.scoreA !== undefined && row.scoreB !== undefined;
	const winnerA = scored && row.status === "Finished" && row.scoreA! > row.scoreB!;
	const winnerB = scored && row.status === "Finished" && row.scoreB! > row.scoreA!;
	const round = row.round === batchLabel ? null : row.round;
	return (
		<li
			className={`grid items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] ${
				live ? "border-[color-mix(in_srgb,var(--live)_50%,var(--line))] bg-[color-mix(in_srgb,var(--live)_7%,transparent)]" : "border-[var(--line)] bg-[var(--bg-soft)]"
			}`}
		>
			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
				<Side name={row.teamA} tag={row.tagA} resolved={row.resolvedA} winner={winnerA} loser={winnerB} highlight={highlight} align="right" />
				<span className={`min-w-12 text-center font-mono text-sm tabular-nums ${scored ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
					{scored ? `${row.scoreA}:${row.scoreB}` : "vs"}
				</span>
				<Side name={row.teamB} tag={row.tagB} resolved={row.resolvedB} winner={winnerB} loser={winnerA} highlight={highlight} align="left" />
			</div>
			<div className="flex items-center justify-center gap-3 sm:contents">
			<div className="flex min-w-0 items-center gap-2 text-xs text-[var(--muted)]">
				<span className={live ? "inline-flex items-center gap-1.5 font-medium text-[var(--live)]" : ""}>
					{live ? <i aria-hidden className="size-1.5 rounded-full bg-[var(--live)]" /> : null}
					{row.preview ? "Live-Vorschau" : (STATUS[row.status] ?? row.status)}
				</span>
				{row.isCasted ? <span className="text-[var(--text)]">· Cast</span> : null}
				{round ? <span className="truncate">· {round}</span> : null}
			</div>
			<div className="text-xs sm:text-right">
				{row.draftHref ? (
					<Link href={row.draftHref} className="font-medium text-[var(--muted)] hover:text-[var(--accent)]">
						Draft ↗
					</Link>
				) : null}
			</div>
			</div>
			{row.note ? <div className="text-xs text-[var(--muted)] sm:col-span-3">{row.note}</div> : null}
			{row.streams.length ? (
				<div className="sm:col-span-3">
					<TournamentLiveStreamLinks streams={row.streams} compact />
				</div>
			) : null}
		</li>
	);
}

function Side({
	name,
	tag,
	resolved,
	winner,
	loser,
	highlight,
	align,
}: {
	name: string;
	tag?: string | null;
	resolved: boolean;
	winner: boolean;
	loser: boolean;
	highlight: string | null;
	align: "left" | "right";
}) {
	const tone = !resolved ? "text-[var(--muted)]" : winner ? "text-[var(--accent)]" : loser ? "text-[var(--muted)]" : "text-[var(--text)]";
	return (
		<div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`} title={name}>
			{resolved && tag ? (
				<span className={`shrink-0 font-mono text-sm font-semibold ${tone} ${highlight === name ? "underline decoration-[var(--accent)] underline-offset-4" : ""}`}>{tag}</span>
			) : null}
			<span className={`min-w-0 truncate text-sm ${resolved && tag ? "text-[var(--muted)] max-sm:hidden" : tone}`}>{name}</span>
		</div>
	);
}
