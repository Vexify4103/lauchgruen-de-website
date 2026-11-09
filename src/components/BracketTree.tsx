"use client";

import { TournamentLink as Link } from "@/app/tournament/TournamentLink";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { compactPoolLabel, type WheelMatchAssignment } from "@/lib/tournament-wheel-shared";
import { resolveBracketFocusMatchId } from "@/lib/tournament-stage-focus";
import type { BracketLayout } from "@/lib/bracket-engine";

const GF_POSITIONS: Record<string, CSSProperties> = {
	gf: { gridRow: "1 / span 1", gridColumn: 1 },
};

type ConnectorKind = "advance";

type Connection = {
	from: string;
	to: string;
	port: "top" | "middle" | "bottom";
	kind: ConnectorKind;
};

type ConnectorPath = { d: string; kind: ConnectorKind; decided: boolean };
export type BracketMatch = {
	id: string;
	bracket?: "Upper" | "Lower" | "Grand";
	round: string;
	teamAName: string | null;
	teamBName: string | null;
	teamALabel: string;
	teamBLabel: string;
	status: "Locked" | "Scheduled" | "Pending" | "Live" | "Finished";
	scoreA?: number;
	scoreB?: number;
	winner?: string | null;
	poolAssignment?: WheelMatchAssignment | null;
	/** Generated brackets carry their own layout and winner sources. */
	layout?: BracketLayout;
	sources?: { teamA?: string; teamB?: string };
	bestOf?: number;
	conditional?: boolean;
};

type LaneLayout = { columns: number; rows: number; labels: string[]; positions: Record<string, CSSProperties> };

/** Grid placement for engine-generated brackets: one grid per lane, rows in half-match units. */
function buildGeneratedLayout(matches: BracketMatch[]) {
	const lanes = new Map<string, LaneLayout>();
	for (const match of matches) {
		const layout = match.layout!;
		const lane = lanes.get(layout.lane) ?? { columns: 0, rows: 0, labels: [], positions: {} };
		lane.columns = Math.max(lane.columns, layout.column + 1);
		lane.rows = Math.max(lane.rows, layout.row + layout.span);
		lane.labels[layout.column] ??= layout.columnLabel;
		lane.positions[match.id] = { gridColumn: layout.column + 1, gridRow: `${layout.row + 1} / span ${layout.span}` };
		lanes.set(layout.lane, lane);
	}
	const connections: Connection[] = matches.flatMap((match) =>
		(["teamA", "teamB"] as const).flatMap((slot) => {
			const source = match.sources?.[slot];
			return source && matches.some((entry) => entry.id === source)
				? [{ from: source, to: match.id, port: slot === "teamA" ? ("top" as const) : ("bottom" as const), kind: "advance" as const }]
				: [];
		})
	);
	return { lanes, connections };
}

function buildBracketLayout(ids: Set<string>) {
	const hasFourOpeningMatches = ids.has("ub-r1-3");
	const hasUpperOpeningMatches = ids.has("ub-r1-1");
	const upperPositions: Record<string, CSSProperties> = hasFourOpeningMatches
		? {
				"ub-r1-1": { gridRow: "1 / span 2", gridColumn: 1 },
				"ub-r1-2": { gridRow: "3 / span 2", gridColumn: 1 },
				"ub-r1-3": { gridRow: "5 / span 2", gridColumn: 1 },
				"ub-r1-4": { gridRow: "7 / span 2", gridColumn: 1 },
				"ub-r2-1": { gridRow: "2 / span 2", gridColumn: 2 },
				"ub-r2-2": { gridRow: "6 / span 2", gridColumn: 2 },
				"ub-f": { gridRow: "4 / span 2", gridColumn: 3 },
			}
		: hasUpperOpeningMatches
			? {
					"ub-r1-1": { gridRow: "1 / span 2", gridColumn: 1 },
					"ub-r1-2": { gridRow: "3 / span 2", gridColumn: 1 },
					"ub-r2-1": { gridRow: "1 / span 2", gridColumn: 2 },
					"ub-r2-2": { gridRow: "3 / span 2", gridColumn: 2 },
					"ub-f": { gridRow: "2 / span 2", gridColumn: 3 },
				}
			: {
					"ub-r2-1": { gridRow: "1 / span 2", gridColumn: 1 },
					"ub-r2-2": { gridRow: "3 / span 2", gridColumn: 1 },
					"ub-f": { gridRow: "2 / span 2", gridColumn: 2 },
				};

	const hasLowerRoundTwo = ids.has("lb-r2-1");
	const hasLowerSemi = ids.has("lb-r3") || ids.has("lb-sf");
	const lowerSemiId = ids.has("lb-r3") ? "lb-r3" : "lb-sf";
	const lowerPositions: Record<string, CSSProperties> = hasLowerRoundTwo
		? {
				"lb-r1-1": { gridRow: "1 / span 2", gridColumn: 1 },
				"lb-r1-2": { gridRow: "3 / span 2", gridColumn: 1 },
				"lb-r2-1": { gridRow: "1 / span 2", gridColumn: 2 },
				"lb-r2-2": { gridRow: "3 / span 2", gridColumn: 2 },
				[lowerSemiId]: { gridRow: "2 / span 2", gridColumn: 3 },
				"lb-f": { gridRow: "1 / span 4", gridColumn: 4 },
			}
		: hasLowerSemi
			? {
					"lb-r1-1": { gridRow: "1 / span 2", gridColumn: 1 },
					"lb-r1-2": { gridRow: "3 / span 2", gridColumn: 1 },
					[lowerSemiId]: { gridRow: "2 / span 2", gridColumn: 2 },
					"lb-f": { gridRow: "1 / span 4", gridColumn: 3 },
				}
			: {
					"lb-r1": { gridRow: "1 / span 2", gridColumn: 1 },
					"lb-f": { gridRow: "1 / span 2", gridColumn: 2 },
				};

	const connections: Connection[] = [];
	const connect = (from: string, to: string, port: Connection["port"] = "middle") => {
		if (ids.has(from) && ids.has(to)) connections.push({ from, to, port, kind: "advance" });
	};
	if (hasFourOpeningMatches) {
		connect("ub-r1-1", "ub-r2-1", "top");
		connect("ub-r1-2", "ub-r2-1", "bottom");
		connect("ub-r1-3", "ub-r2-2", "top");
		connect("ub-r1-4", "ub-r2-2", "bottom");
	} else {
		connect("ub-r1-1", "ub-r2-1");
		connect("ub-r1-2", "ub-r2-2");
	}
	connect("ub-r2-1", ids.has("ub-f") ? "ub-f" : "gf", "top");
	connect("ub-r2-2", ids.has("ub-f") ? "ub-f" : "gf", "bottom");
	connect("lb-r1-1", hasLowerRoundTwo ? "lb-r2-1" : lowerSemiId, "top");
	connect("lb-r1-2", hasLowerRoundTwo ? "lb-r2-2" : lowerSemiId, "bottom");
	connect("lb-r2-1", lowerSemiId, "top");
	connect("lb-r2-2", lowerSemiId, "bottom");
	connect("lb-r1", "lb-f");
	connect(lowerSemiId, "lb-f");
	connect("ub-f", "gf", "top");
	connect("lb-f", "gf", "bottom");

	return {
		upperPositions,
		upperColumns: hasUpperOpeningMatches ? 3 : 2,
		upperRows: hasFourOpeningMatches ? 8 : 4,
		upperLabels: hasUpperOpeningMatches ? ["Runde 1", "Runde 2", "Upper Final"] : ["Upper-Halbfinale", "Upper Final"],
		lowerPositions,
		lowerColumns: hasLowerRoundTwo ? 4 : hasLowerSemi ? 3 : 2,
		lowerLabels: hasLowerRoundTwo
			? ["Runde 1", "Runde 2", "Lower-Halbfinale", "Lower Final"]
			: hasLowerSemi
				? ["Runde 1", "Lower-Halbfinale", "Lower Final"]
				: ["Lower Runde 1", "Lower Final"],
		connections,
	};
}

export function BracketTree({ matches, showPools = true }: { matches: BracketMatch[]; showPools?: boolean }) {
	const matchIds = matches.map((match) => match.id).join("|");
	const layout = buildBracketLayout(new Set(matches.map((match) => match.id)));
	const generated = matches.length > 0 && matches.every((match) => match.layout);
	const layoutKey = matches.map((match) => `${match.id}:${match.layout?.lane}:${match.layout?.column}:${match.layout?.row}`).join("|");
	// eslint-disable-next-line react-hooks/exhaustive-deps -- the key captures every layout input
	const generatedLayout = useMemo(() => buildGeneratedLayout(generated ? matches : []), [layoutKey, generated]);
	const scrollRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const lastFocusedMatch = useRef<string | null>(null);
	const [paths, setPaths] = useState<ConnectorPath[]>([]);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const compute = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		const containerRect = container.getBoundingClientRect();
		const nextSize = { w: containerRect.width, h: containerRect.height };
		setSize((prev) => (prev.w === nextSize.w && prev.h === nextSize.h ? prev : nextSize));

		const next: ConnectorPath[] = [];
		const connections = generated ? generatedLayout.connections : buildBracketLayout(new Set(matchIds.split("|").filter(Boolean))).connections;
		for (const conn of connections) {
			const from = cardRefs.current.get(conn.from);
			const to = cardRefs.current.get(conn.to);
			if (!from || !to) continue;
			const decided = Boolean(matches.find((entry) => entry.id === conn.from)?.winner);
			const fr = from.getBoundingClientRect();
			const tr = to.getBoundingClientRect();

			// Same-column drops/stacks are clearer as a straight vertical line.
			if (fr.right >= tr.left - 4) {
				const x = (Math.min(fr.right, tr.right) + Math.max(fr.left, tr.left)) / 2 - containerRect.left;
				const y1 = fr.bottom - containerRect.top;
				const y2 = tr.top - containerRect.top;
				next.push({
					d: `M ${x.toFixed(1)} ${y1.toFixed(1)} L ${x.toFixed(1)} ${y2.toFixed(1)}`,
					kind: conn.kind,
					decided,
				});
				continue;
			}

			const x1 = fr.right - containerRect.left;
			const y1 = fr.top + fr.height / 2 - containerRect.top;
			const x2 = tr.left - containerRect.left;
			const yPortOffset = tr.height * 0.22;
			const y2 = tr.top + tr.height / 2 + (conn.port === "top" ? -yPortOffset : conn.port === "bottom" ? yPortOffset : 0) - containerRect.top;

			const midX = (x1 + x2) / 2;
			const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${midX.toFixed(1)} ${y1.toFixed(1)} L ${midX.toFixed(1)} ${y2.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
			next.push({ d, kind: conn.kind, decided });
		}
		setPaths((prev) => (prev.length === next.length && prev.every((path, index) => path.d === next[index]?.d && path.decided === next[index]?.decided) ? prev : next));
	}, [matchIds, generated, generatedLayout, matches]);

	useEffect(() => {
		compute();
		const observer = new ResizeObserver(compute);
		if (containerRef.current) observer.observe(containerRef.current);
		for (const card of cardRefs.current.values()) observer.observe(card);
		window.addEventListener("resize", compute);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", compute);
		};
	}, [compute, matches.length]);

	const lookup = (id: string) => matches.find((m) => m.id === id);

	const registerCard = (id: string) => (el: HTMLDivElement | null) => {
		if (el) cardRefs.current.set(id, el);
		else cardRefs.current.delete(id);
	};
	const focusMatchId = resolveBracketFocusMatchId(matches);

	useLayoutEffect(() => {
		if (!focusMatchId || lastFocusedMatch.current === focusMatchId) return;
		const scroller = scrollRef.current;
		const target = cardRefs.current.get(focusMatchId);
		if (!scroller || !target) return;
		const scrollerRect = scroller.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		const targetCenter = targetRect.left - scrollerRect.left + scroller.scrollLeft + targetRect.width / 2;
		const left = Math.max(0, Math.min(targetCenter - scroller.clientWidth / 2, scroller.scrollWidth - scroller.clientWidth));
		scroller.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
		lastFocusedMatch.current = focusMatchId;
	}, [focusMatchId, matches.length]);

	if (generated) {
		const lane = (name: string) => generatedLayout.lanes.get(name);
		const upper = lane("upper");
		const lower = lane("lower");
		const finals = lane("final");
		const placement = lane("placement");
		const leftColumns = Math.max(upper?.columns ?? 0, lower?.columns ?? 0);
		const hasReset = matches.some((match) => match.conditional);
		const section = (key: string, label: string, entry: LaneLayout | undefined, columnWidth = COLUMN_WIDTH) =>
			entry ? (
				<BracketSection
					key={key}
					label={label}
					columnLabels={key === "final" ? [] : entry.labels.map((value) => value ?? "")}
					columns={entry.columns}
					columnWidth={columnWidth}
					rows={entry.rows}
					rowHeight="2.9rem"
					positions={entry.positions}
					matches={matches}
					showPools={showPools}
					registerCard={registerCard}
					lookup={lookup}
				/>
			) : null;
		return (
			<div ref={scrollRef} className="themed-scrollbar -mx-2 overflow-x-auto px-2 pb-2">
				<div ref={containerRef} className="relative grid w-max gap-x-12" style={{ gridTemplateColumns: leftColumns ? "max-content max-content" : "max-content" }}>
					<Connectors paths={paths} size={size} />
					{leftColumns ? (
						<div className="relative z-10 flex flex-col gap-10">
							{section("upper", lower ? "Upper Bracket" : "Bracket", upper)}
							{section("lower", "Lower Bracket", lower)}
						</div>
					) : null}
					<div className="relative z-10 flex flex-col justify-center gap-10">
						{section("final", hasReset ? "Grand Final" : "Finale", finals, FINAL_WIDTH)}
						{section("placement", "Platzierung", placement)}
					</div>
				</div>
				<Legend note={lower && finals ? (hasReset ? "Bracket Reset, falls das Team aus dem Lower Bracket das Grand Final gewinnt" : "Grand Final ohne Bracket Reset") : null} />
			</div>
		);
	}

	return (
		<div ref={scrollRef} className="themed-scrollbar -mx-2 overflow-x-auto px-2 pb-2">
			<div ref={containerRef} className="relative grid w-max gap-x-12" style={{ gridTemplateColumns: "max-content max-content" }}>
				<Connectors paths={paths} size={size} />

				<div className="relative z-10 flex flex-col gap-10">
					<BracketSection
						label="Upper Bracket"
						columnLabels={layout.upperLabels}
						columns={layout.upperColumns}
						rows={layout.upperRows}
						positions={layout.upperPositions}
						matches={matches}
						showPools={showPools}
						registerCard={registerCard}
						lookup={lookup}
					/>

					{matches.some((match) => match.bracket === "Lower") ? (
						<BracketSection
							label="Lower Bracket"
							columnLabels={layout.lowerLabels}
							columns={layout.lowerColumns}
							rows={4}
							positions={layout.lowerPositions}
							matches={matches}
							showPools={showPools}
							registerCard={registerCard}
							lookup={lookup}
						/>
					) : null}
				</div>

				<div className="relative z-10 flex flex-col justify-center">
					<BracketSection
						label="Grand Final"
						columnLabels={[]}
						columns={1}
						columnWidth={FINAL_WIDTH}
						rows={1}
						positions={GF_POSITIONS}
						matches={matches}
						showPools={showPools}
						registerCard={registerCard}
						lookup={lookup}
					/>
				</div>
			</div>
			<Legend note="Grand Final ohne Bracket Reset" />
		</div>
	);
}

// Every column has the same width, so upper and lower cards line up and names have room.
const COLUMN_WIDTH = "14rem";
const FINAL_WIDTH = "15rem";

function Connectors({ paths, size }: { paths: ConnectorPath[]; size: { w: number; h: number } }) {
	return (
		<svg aria-hidden className="pointer-events-none absolute inset-0 -z-0" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
			{paths.map((p, i) => (
				<path
					key={i}
					d={p.d}
					fill="none"
					strokeWidth={p.decided ? 2 : 1.5}
					stroke={p.decided ? "var(--accent)" : "var(--line-strong)"}
					strokeOpacity={p.decided ? 0.8 : 1}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			))}
		</svg>
	);
}

function Legend({ note }: { note: string | null }) {
	return (
		<div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-xs text-[var(--muted)]">
			<span className="inline-flex items-center gap-2">
				<span aria-hidden className="h-0.5 w-5 rounded-full bg-[var(--accent)]" />
				Sieger ist weitergezogen
			</span>
			<span className="inline-flex items-center gap-2">
				<span aria-hidden className="h-px w-5 bg-[var(--line-strong)]" />
				Noch offen
			</span>
			{note ? <span>{note}</span> : null}
		</div>
	);
}

function BracketSection({
	label,
	columnLabels,
	columns,
	columnWidth = COLUMN_WIDTH,
	rows,
	rowHeight = "5.5rem",
	positions,
	registerCard,
	lookup,
	showPools,
}: {
	label: string;
	columnLabels: string[];
	columns: number;
	columnWidth?: string;
	rows: number;
	rowHeight?: string;
	positions: Record<string, CSSProperties>;
	matches: BracketMatch[];
	registerCard: (id: string) => (el: HTMLDivElement | null) => void;
	lookup: (id: string) => BracketMatch | undefined;
	showPools: boolean;
}) {
	const gridCols = `repeat(${columns}, ${columnWidth})`;

	return (
		<section>
			<div className="flex items-center gap-3 pb-4">
				<h3 className="shrink-0 text-sm font-semibold text-[var(--text)]">{label}</h3>
				<span className="h-px flex-1 bg-[var(--line)]" />
			</div>

			<div className="grid gap-x-8" style={{ gridTemplateColumns: gridCols }}>
				{columnLabels.map((columnLabel, i) => (
					<div key={columnLabel + i} className="text-xs text-[var(--muted)]" style={{ gridColumn: i + 1 }}>
						{columnLabel}
					</div>
				))}
			</div>

			<div
				className="mt-2 grid gap-x-8 gap-y-2"
				style={{
					gridTemplateColumns: gridCols,
					gridTemplateRows: `repeat(${rows}, minmax(${rowHeight}, auto))`,
				}}
			>
				{Object.entries(positions).map(([id, position]) => {
					const match = lookup(id);
					if (!match) return null;
					return (
						<div key={id} ref={registerCard(id)} className="flex items-center" style={position}>
							<BracketCard match={match} showPools={showPools} />
						</div>
					);
				})}
			</div>
		</section>
	);
}

const STATUS_LABELS: Record<BracketMatch["status"], string> = {
	Locked: "Wartet",
	Pending: "Bereit",
	Scheduled: "Geplant",
	Live: "Live",
	Finished: "Beendet",
};

function BracketCard({ match, showPools }: { match: BracketMatch; showPools: boolean }) {
	const winnerIsA = !!match.winner && match.winner === match.teamAName;
	const winnerIsB = !!match.winner && match.winner === match.teamBName;
	const decided = winnerIsA || winnerIsB;
	const hasScore = match.scoreA !== undefined && match.scoreB !== undefined;
	const live = match.status === "Live";
	const isFinalTier = match.bracket === "Grand" || match.round === "Grand Final";

	return (
		<article
			className={`flex w-full flex-col overflow-hidden rounded-xl border bg-[var(--panel-solid)] ${
				live ? "border-[color-mix(in_srgb,var(--live)_55%,transparent)]" : isFinalTier ? "border-[var(--line-strong)]" : "border-[var(--line)]"
			}`}
		>
			<header className="flex items-center justify-between gap-2 px-3 pb-1 pt-2 text-xs">
				<span className="truncate text-[var(--muted)]">
					{match.layout ? generatedCardLabel(match.round) : match.round}
					{match.bestOf && match.bestOf > 1 ? <span className="ml-1.5 font-mono">Bo{match.bestOf}</span> : null}
				</span>
				<span className={`inline-flex shrink-0 items-center gap-1.5 ${live ? "font-medium text-[var(--live)]" : "text-[var(--muted)]"}`}>
					{live ? <span aria-hidden className="size-1.5 rounded-full bg-[var(--live)]" /> : null}
					{STATUS_LABELS[match.status]}
				</span>
			</header>

			<TeamLine label={match.teamALabel} resolved={!!match.teamAName} score={match.scoreA} isWinner={winnerIsA} isLoser={decided && !winnerIsA} hasScore={hasScore} pool={match.poolAssignment?.teamAPool ?? null} />
			<TeamLine label={match.teamBLabel} resolved={!!match.teamBName} score={match.scoreB} isWinner={winnerIsB} isLoser={decided && !winnerIsB} hasScore={hasScore} pool={match.poolAssignment?.teamBPool ?? null} />

			{showPools && match.poolAssignment ? (
				<footer className="border-t border-[var(--line)] px-3 py-1.5 text-xs">
					<Link href={`/tournament/champ-select/${match.id}/spectate`} className="text-[var(--muted)] underline-offset-2 transition-colors hover:text-[var(--text)] hover:underline">
						Draft ansehen
					</Link>
				</footer>
			) : null}
		</article>
	);
}

function TeamLine({
	label,
	resolved,
	score,
	isWinner,
	isLoser,
	hasScore,
	pool,
}: {
	label: string;
	resolved: boolean;
	score: number | undefined;
	isWinner: boolean;
	isLoser: boolean;
	hasScore: boolean;
	pool: string | null;
}) {
	return (
		<div className="relative flex min-h-9 items-center gap-2 px-3 py-1.5">
			{isWinner ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[var(--accent)]" /> : null}
			<span
				className={`min-w-0 flex-1 truncate ${
					resolved ? `text-sm ${isWinner ? "font-semibold text-[var(--text)]" : isLoser ? "text-[var(--muted)]" : "font-medium text-[var(--text)]"}` : "text-xs text-[var(--muted)]"
				}`}
				title={label}
			>
				{resolved ? label : compactPlaceholder(label)}
			</span>
			{pool ? <span className="shrink-0 rounded-md border border-[var(--line)] px-1.5 py-px font-mono text-xs text-[var(--muted)]">{compactPoolLabel(pool)}</span> : null}
			{hasScore ? (
				<span className={`w-5 shrink-0 text-right font-mono text-sm tabular-nums ${isWinner ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}`}>{score}</span>
			) : null}
		</div>
	);
}

/** "Sieger Upper Runde 1 · Match 2" reads as "Sieger Upper R1 · M2" so it fits; the full text stays in the tooltip. */
function compactPlaceholder(label: string): string {
	return label
		.replace(/Runde (\d+)/g, "R$1")
		.replace(/Match (\d+)/g, "M$1")
		.replace(/Halbfinale/g, "HF");
}

/** Generated brackets name the round in the column header; the card only needs the part after it. */
function generatedCardLabel(round: string): string {
	const parts = round.split(" · ");
	return parts.length > 1 ? parts.at(-1)! : round;
}
