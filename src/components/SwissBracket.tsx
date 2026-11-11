"use client";

import { useMemo, useState } from "react";
import type { TournamentSettings } from "@/lib/tournament-settings";
import type { SwissPairing, SwissStageState } from "@/lib/tournament-swiss";
import { generateTeamTag } from "@/lib/team-tag";

type StageConfig = TournamentSettings["structure"];
type Record2 = { wins: number; losses: number };
type Bucket =
	| { kind: "matches"; key: string; record: Record2 | null; pairings: SwissPairing[]; open: number }
	| { kind: "result"; key: string; record: Record2; teams: string[]; tone: "advance" | "out" };

const NO_ENTRIES: Record<string, string> = {};

const recordLabel = (record: Record2) => `${record.wins}–${record.losses}`;

function choose(total: number, selected: number) {
	if (selected < 0 || selected > total) return 0;
	let result = 1;
	for (let index = 1; index <= selected; index += 1) result = (result * (total - selected + index)) / index;
	return result;
}

/** Teams expected in a record after `played` games, when every match splits the field in half. */
function expectedTeams(teamCount: number, played: number, wins: number) {
	return Math.round((teamCount * choose(played, wins)) / 2 ** played);
}

/** The 8-team, 4-round placement Swiss ends 2–0 and 0–2 after round three. */
const PLACEMENT_MATCHES: Record<number, Record<string, number>> = {
	1: { "0-0": 4 },
	2: { "1-0": 2, "0-1": 2 },
	3: { "2-0": 1, "1-1": 2, "0-2": 1 },
	4: { "2-1": 1, "1-2": 1 },
};

/**
 * Swiss Stage as columns of record buckets (0–0, 1–0, 0–1, …) with one short row per match.
 * Clicking a team highlights every match it played, so its path through the stage is easy to follow.
 */
export function SwissBracket({
	config,
	teamNames,
	state,
	activeRound = 1,
	tags = NO_ENTRIES,
	statuses = NO_ENTRIES,
}: {
	config: StageConfig;
	teamNames: string[];
	state: SwissStageState;
	activeRound?: number;
	/** Team name -> short tag. */
	tags?: Record<string, string>;
	/** Match id -> status, for the live marker. */
	statuses?: Record<string, string>;
}) {
	const [selected, setSelected] = useState<string | null>(null);
	const elimination = config.dayOneFormat === "swiss-elimination";
	const need = elimination ? config.swissWinsToAdvance : Infinity;
	const placement = config.teamCount === 8 && config.advanceTeamCount === 8 && config.swissRounds === 4;
	const tagOf = useMemo(() => {
		// Teams without a known tag get one generated once, up front.
		const known = new Map(Object.entries(tags));
		const all = [...teamNames, ...state.rounds.flatMap((round) => round.pairings.flatMap((pairing) => [pairing.teamAName, pairing.teamBName ?? ""]))];
		for (const name of all) if (name && !known.has(name)) known.set(name, generateTeamTag(name, known.values()));
		return (name: string | null | undefined) => (name ? (known.get(name) ?? name.slice(0, 4).toUpperCase()) : "TBD");
	}, [tags, teamNames, state]);

	const columns = useMemo(() => buildColumns(state, config, need, placement), [state, config, need, placement]);
	const seeds = state.finalSeedNames ?? (placement ? placementSeeds(state) : undefined);

	const toggle = (name: string | null | undefined) => {
		if (!name) return;
		setSelected((current) => (current === name ? null : name));
	};

	return (
		<div className="swiss-bracket grid gap-4">
			{teamNames.length ? (
				<div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Team hervorheben">
					{[...teamNames]
						.sort((a, b) => tagOf(a).localeCompare(tagOf(b)))
						.map((name) => (
							<button
								key={name}
								type="button"
								onClick={() => toggle(name)}
								aria-pressed={selected === name}
								title={name}
								className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
									selected === name
										? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text)]"
										: "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
								}`}
							>
								<span className="font-mono font-semibold text-[var(--text)]">{tagOf(name)}</span>
								<span className="max-w-[10rem] truncate">{name}</span>
							</button>
						))}
				</div>
			) : null}

			<div className="themed-scrollbar overflow-x-auto pb-2">
				<div className="mx-auto flex w-max items-stretch gap-8">
					{columns.map((column, index) => (
						<section key={index} data-swiss-round={index + 1} aria-label={column.label} className="flex w-[12.5rem] flex-col">
							<h3
								className={`mb-3 text-center text-xs font-medium ${index + 1 === activeRound && index < config.swissRounds ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
							>
								{column.label}
							</h3>
							<div className="flex flex-1 flex-col justify-center gap-4">
								{column.buckets.map((bucket) => (
									<BucketBox key={bucket.key} bucket={bucket} tagOf={tagOf} selected={selected} onSelect={toggle} statuses={statuses} />
								))}
							</div>
						</section>
					))}
					{seeds || placement || !elimination ? (
						<section aria-label="Setzliste" className="flex w-[12.5rem] flex-col">
							<h3 className="mb-3 text-center text-xs font-medium text-[var(--muted)]">
								{config.advanceTeamCount >= config.teamCount ? "Playoff-Seeds" : "Qualifiziert"}
							</h3>
							<div className="flex flex-1 flex-col justify-center">
								<ol className="overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]">
									{Array.from({ length: config.advanceTeamCount }, (_, index) => {
										const name = seeds?.[index + 1];
										const dim = selected && name !== selected;
										return (
											<li
												key={index}
												className={`flex items-center gap-2 border-t border-[var(--line)] px-2.5 py-1.5 text-xs first:border-t-0 ${dim ? "opacity-30" : ""}`}
											>
												<span className="w-6 font-mono text-[var(--accent)]">#{index + 1}</span>
												{name ? (
													<button
														type="button"
														onClick={() => toggle(name)}
														title={name}
														className="font-mono font-semibold text-[var(--text)] hover:underline"
													>
														{tagOf(name)}
													</button>
												) : (
													<span className="text-[var(--muted)]">offen</span>
												)}
											</li>
										);
									})}
								</ol>
							</div>
						</section>
					) : null}
				</div>
			</div>
		</div>
	);
}

function BucketBox({
	bucket,
	tagOf,
	selected,
	onSelect,
	statuses,
}: {
	bucket: Bucket;
	tagOf: (name: string | null | undefined) => string;
	selected: string | null;
	onSelect: (name: string | null | undefined) => void;
	statuses: Record<string, string>;
}) {
	if (bucket.kind === "result") {
		const advance = bucket.tone === "advance";
		return (
			<div
				className={`overflow-hidden rounded-lg border ${advance ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]" : "border-[color-mix(in_srgb,var(--danger)_45%,var(--line))]"}`}
			>
				<div
					className={`px-2 py-1 text-center font-mono text-xs font-semibold ${
						advance
							? "bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-[var(--accent)]"
							: "bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)]"
					}`}
				>
					{recordLabel(bucket.record)}
				</div>
				<div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 py-1.5">
					{bucket.teams.length ? (
						bucket.teams.map((name) => (
							<button
								key={name}
								type="button"
								onClick={() => onSelect(name)}
								title={name}
								className={`font-mono text-xs font-semibold transition-opacity ${selected && selected !== name ? "opacity-30" : "text-[var(--text)]"}`}
							>
								{tagOf(name)}
							</button>
						))
					) : (
						<span className="text-xs text-[var(--muted)]">—</span>
					)}
				</div>
			</div>
		);
	}
	return (
		<div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-solid)]">
			<div className="bg-[var(--bg-soft)] px-2 py-1 text-center font-mono text-xs text-[var(--muted)]">{bucket.record ? recordLabel(bucket.record) : bucket.key}</div>
			<ul>
				{bucket.pairings.map((pairing) => {
					const involved = selected === pairing.teamAName || selected === pairing.teamBName;
					const live = statuses[pairing.id] === "Live";
					const winnerA = pairing.winnerTeamKey && pairing.winnerTeamKey === pairing.teamAKey;
					const winnerB = pairing.winnerTeamKey && pairing.winnerTeamKey === pairing.teamBKey;
					return (
						<li
							key={pairing.id}
							className={`grid grid-cols-[1fr_auto_1fr] items-center gap-1 border-t border-[var(--line)] px-3 py-1.5 text-sm transition-opacity first:border-t-0 ${
								selected && !involved ? "opacity-25" : ""
							} ${involved ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : ""}`}
						>
							<TeamTag name={pairing.teamAName} tag={tagOf(pairing.teamAName)} won={Boolean(winnerA)} lost={Boolean(winnerB)} onSelect={onSelect} align="right" />
							<span className={`w-8 text-center text-[11px] ${live ? "font-semibold text-[var(--live)]" : "text-[var(--muted)]"}`}>
								{pairing.bye ? "frei" : live ? "live" : pairing.winnerTeamKey ? (winnerA ? "1:0" : "0:1") : "vs"}
							</span>
							<TeamTag
								name={pairing.teamBName}
								tag={pairing.teamBName ? tagOf(pairing.teamBName) : "—"}
								won={Boolean(winnerB)}
								lost={Boolean(winnerA)}
								onSelect={onSelect}
								align="left"
							/>
						</li>
					);
				})}
				{Array.from({ length: bucket.open }, (_, index) => (
					<li
						key={`open-${index}`}
						className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 border-t border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] first:border-t-0"
					>
						<span className="text-right">—</span>
						<span className="w-8 text-center text-[11px]">vs</span>
						<span>—</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function TeamTag({
	name,
	tag,
	won,
	lost,
	onSelect,
	align,
}: {
	name: string | null;
	tag: string;
	won: boolean;
	lost: boolean;
	onSelect: (name: string | null | undefined) => void;
	align: "left" | "right";
}) {
	if (!name) return <span className={`text-[var(--muted)] ${align === "right" ? "text-right" : ""}`}>{tag}</span>;
	return (
		<button
			type="button"
			onClick={() => onSelect(name)}
			title={name}
			className={`truncate font-mono font-semibold hover:underline ${align === "right" ? "text-right" : "text-left"} ${
				won ? "text-[var(--accent)]" : lost ? "text-[var(--muted)]" : "text-[var(--text)]"
			}`}
		>
			{tag}
		</button>
	);
}

/** Wins and losses of every team before each round, from the results of earlier rounds. */
function recordsBeforeRounds(state: SwissStageState) {
	const running = new Map<string, Record2>();
	const before = new Map<number, Map<string, Record2>>();
	for (const round of [...state.rounds].sort((a, b) => a.round - b.round)) {
		before.set(round.round, new Map([...running].map(([key, value]) => [key, { ...value }])));
		for (const pairing of round.pairings) {
			const a = running.get(pairing.teamAKey) ?? { wins: 0, losses: 0 };
			running.set(pairing.teamAKey, a);
			if (pairing.bye) {
				a.wins += 1;
				continue;
			}
			if (!pairing.teamBKey) continue;
			const b = running.get(pairing.teamBKey) ?? { wins: 0, losses: 0 };
			running.set(pairing.teamBKey, b);
			if (!pairing.winnerTeamKey) continue;
			if (pairing.winnerTeamKey === pairing.teamAKey) {
				a.wins += 1;
				b.losses += 1;
			} else {
				b.wins += 1;
				a.losses += 1;
			}
		}
	}
	return { before, after: running };
}

function buildColumns(state: SwissStageState, config: StageConfig, need: number, placement: boolean) {
	const { before, after } = recordsBeforeRounds(state);
	const names = new Map<string, string>();
	for (const round of state.rounds) {
		for (const pairing of round.pairings) {
			names.set(pairing.teamAKey, pairing.teamAName);
			if (pairing.teamBKey && pairing.teamBName) names.set(pairing.teamBKey, pairing.teamBName);
		}
	}
	const columns: Array<{ label: string; buckets: Bucket[] }> = [];
	const finished = (record: Record2) => record.wins >= need || record.losses >= need;
	// Teams that reached a final record, by the round after which they finished.
	const resultBuckets = (afterRound: number): Bucket[] => {
		if (!Number.isFinite(need)) return [];
		const buckets = new Map<string, Bucket & { kind: "result" }>();
		for (const [key, record] of after) {
			if (!finished(record) || record.wins + record.losses !== afterRound) continue;
			const id = `${record.wins}-${record.losses}`;
			const bucket = buckets.get(id) ?? {
				kind: "result" as const,
				key: `done-${id}`,
				record,
				teams: [],
				tone: record.wins >= need ? ("advance" as const) : ("out" as const),
			};
			bucket.teams.push(names.get(key) ?? key);
			buckets.set(id, bucket);
		}
		// Final records nobody reached yet still get an empty box.
		for (let other = 0; other < need; other += 1) {
			if (need + other !== afterRound) continue;
			if (!buckets.has(`${need}-${other}`))
				buckets.set(`${need}-${other}`, { kind: "result", key: `done-${need}-${other}`, record: { wins: need, losses: other }, teams: [], tone: "advance" });
			if (!buckets.has(`${other}-${need}`))
				buckets.set(`${other}-${need}`, { kind: "result", key: `done-${other}-${need}`, record: { wins: other, losses: need }, teams: [], tone: "out" });
		}
		return [...buckets.values()].sort((a, b) => b.record.wins - a.record.wins);
	};

	for (let round = 1; round <= config.swissRounds; round += 1) {
		const actual = state.rounds.find((entry) => entry.round === round);
		const records = before.get(round);
		const buckets = new Map<string, Bucket & { kind: "matches" }>();
		for (const pairing of actual?.pairings ?? []) {
			const a = records?.get(pairing.teamAKey) ?? { wins: 0, losses: 0 };
			const b = pairing.teamBKey ? (records?.get(pairing.teamBKey) ?? { wins: 0, losses: 0 }) : a;
			const same = a.wins === b.wins && a.losses === b.losses;
			const key = same ? `${a.wins}-${a.losses}` : `${recordLabel(a)} / ${recordLabel(b)}`;
			const bucket = buckets.get(key) ?? { kind: "matches" as const, key, record: same ? a : null, pairings: [], open: 0 };
			bucket.pairings.push(pairing);
			buckets.set(key, bucket);
		}
		// Planned buckets with open slots, from the expected spread of records.
		const played = round - 1;
		for (let losses = played; losses >= 0; losses -= 1) {
			const wins = played - losses;
			const record = { wins, losses };
			if (finished(record)) continue;
			const key = `${wins}-${losses}`;
			const planned = placement ? (PLACEMENT_MATCHES[round]?.[key] ?? 0) : Math.floor(expectedTeams(config.teamCount, played, wins) / 2);
			if (!planned && !buckets.has(key)) continue;
			const bucket = buckets.get(key) ?? { kind: "matches" as const, key, record, pairings: [], open: 0 };
			bucket.open = Math.max(0, planned - bucket.pairings.length);
			buckets.set(key, bucket);
		}
		const ordered = [...buckets.values()].sort((a, b) => (b.record?.wins ?? -1) - (a.record?.wins ?? -1) || (a.record?.losses ?? 0) - (b.record?.losses ?? 0));
		const done = resultBuckets(round - 1);
		const advanced = done.filter((bucket) => bucket.kind === "result" && bucket.tone === "advance");
		const out = done.filter((bucket) => bucket.kind === "result" && bucket.tone === "out");
		columns.push({ label: `Runde ${round}`, buckets: [...advanced, ...ordered, ...out] });
	}
	const last = resultBuckets(config.swissRounds);
	if (last.length) columns.push({ label: "Ergebnis", buckets: last });
	return columns;
}

/** Seeds of the 8-team placement Swiss once rounds three and four are complete. */
function placementSeeds(state: SwissStageState): Record<number, string> | undefined {
	const third = state.rounds.find((round) => round.round === 3);
	const fourth = state.rounds.find((round) => round.round === 4);
	if (!third?.complete || !fourth?.complete) return undefined;
	const { before } = recordsBeforeRounds(state);
	const assignments = [
		{ round: third, record: "2-0", winnerSeed: 1, loserSeed: 2 },
		{ round: fourth, record: "2-1", winnerSeed: 3, loserSeed: 4 },
		{ round: fourth, record: "1-2", winnerSeed: 5, loserSeed: 6 },
		{ round: third, record: "0-2", winnerSeed: 7, loserSeed: 8 },
	];
	const seeds: Record<number, string> = {};
	for (const assignment of assignments) {
		const records = before.get(assignment.round.round);
		const pairing = assignment.round.pairings.find((entry) => {
			const record = records?.get(entry.teamAKey);
			return record && `${record.wins}-${record.losses}` === assignment.record;
		});
		if (!pairing?.teamBName || !pairing.winnerTeamKey) return undefined;
		seeds[assignment.winnerSeed] = pairing.winnerTeamKey === pairing.teamAKey ? pairing.teamAName : pairing.teamBName;
		seeds[assignment.loserSeed] = pairing.winnerTeamKey === pairing.teamAKey ? pairing.teamBName : pairing.teamAName;
	}
	return seeds;
}
