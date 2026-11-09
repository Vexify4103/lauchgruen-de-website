"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { WheelMatchAssignment } from "@/lib/tournament-wheel-shared";
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

export function BracketTree({ matches }: { matches: BracketMatch[]; /** Kept for callers; the redesigned cards no longer show champion pools. */ showPools?: boolean }) {
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

	const connections = generated ? generatedLayout.connections : layout.connections;
	const nextLabel = (match: BracketMatch) => routeLabel(match, matches, connections);

	if (generated) {
		const lane = (name: string) => generatedLayout.lanes.get(name);
		const upper = lane("upper");
		const lower = lane("lower");
		const finals = lane("final");
		const placement = lane("placement");
		const leftColumns = Math.max(upper?.columns ?? 0, lower?.columns ?? 0);
		const hasReset = matches.some((match) => match.conditional);
		const section = (key: string, label: string, entry: LaneLayout | undefined, tone: LaneTone = "neutral") =>
			entry ? (
				<BracketSection
					key={key}
					label={label}
					tone={tone}
					columnLabels={entry.labels.map((value) => value ?? "")}
					columns={entry.columns}
					rows={entry.rows}
					rowHeight="3.6rem"
					positions={entry.positions}
					matches={matches}
					registerCard={registerCard}
					lookup={lookup}
					nextLabel={nextLabel}
				/>
			) : null;
		return (
			<BracketFrame
				note={lower && finals ? (hasReset ? "Gewinnt das Team aus dem Lower Bracket das Grand Final, folgt ein Bracket Reset." : "Das Grand Final ist ein einzelnes Do-or-die-Match ohne Bracket Reset.") : null}
			>
				<div ref={scrollRef} className="themed-scrollbar overflow-x-auto p-4 sm:p-6">
					<div ref={containerRef} className="relative grid w-max gap-x-4" style={{ gridTemplateColumns: leftColumns ? "max-content max-content" : "max-content" }}>
						<Connectors paths={paths} size={size} />
						{leftColumns ? (
							<div className="flex flex-col gap-6">
								{section("upper", lower ? "Upper Bracket" : "Bracket", upper)}
								{section("lower", "Lower Bracket", lower)}
							</div>
						) : null}
						<div className="flex flex-col justify-center gap-6">
							{section("final", hasReset ? "Grand Final" : "Finale", finals, "final")}
							{section("placement", "Platzierung", placement)}
						</div>
					</div>
				</div>
			</BracketFrame>
		);
	}

	return (
		<BracketFrame note="Das Grand Final ist ein einzelnes Do-or-die-Match ohne Bracket Reset.">
			<div ref={scrollRef} className="themed-scrollbar overflow-x-auto p-4 sm:p-6">
				<div ref={containerRef} className="relative grid w-max gap-x-4" style={{ gridTemplateColumns: "max-content max-content" }}>
					<Connectors paths={paths} size={size} />
					<div className="flex flex-col gap-6">
						<BracketSection
							label="Upper Bracket"
							columnLabels={layout.upperLabels}
							columns={layout.upperColumns}
							rows={layout.upperRows}
							positions={layout.upperPositions}
							matches={matches}
							registerCard={registerCard}
							lookup={lookup}
							nextLabel={nextLabel}
						/>
						{matches.some((match) => match.bracket === "Lower") ? (
							<BracketSection
								label="Lower Bracket"
								columnLabels={layout.lowerLabels}
								columns={layout.lowerColumns}
								rows={4}
								positions={layout.lowerPositions}
								matches={matches}
								registerCard={registerCard}
								lookup={lookup}
								nextLabel={nextLabel}
							/>
						) : null}
					</div>
					<div className="flex flex-col justify-center">
						<BracketSection
							label="Grand Final"
							tone="final"
							columnLabels={["Finale"]}
							columns={1}
							rows={1}
							positions={GF_POSITIONS}
							matches={matches}
							registerCard={registerCard}
							lookup={lookup}
							nextLabel={nextLabel}
						/>
					</div>
				</div>
			</div>
		</BracketFrame>
	);
}

// Narrower than the Swiss Stage columns because a double-elimination bracket has up to five columns side by side.
const COLUMN_WIDTH = "15rem";

type LaneTone = "neutral" | "final";

/** "Sieger → Upper HF 1 · Verlierer → Lower R1 · M1", derived from the bracket's own wiring. */
function routeLabel(match: BracketMatch, matches: BracketMatch[], connections: Connection[]): string | null {
	const winnerTarget = matches.find((entry) => entry.id === connections.find((connection) => connection.from === match.id)?.to);
	const loserText = `Verlierer ${match.round}`;
	const loserTarget = matches.find((entry) => entry.teamALabel === loserText || entry.teamBLabel === loserText);
	const parts = [
		winnerTarget ? `Sieger → ${compactPlaceholder(winnerTarget.round)}` : match.bracket === "Grand" || /final/i.test(match.round) ? "Sieger → Turniersieg" : null,
		loserTarget ? `Verlierer → ${compactPlaceholder(loserTarget.round)}` : null,
	].filter(Boolean);
	return parts.length ? parts.join(" · ") : null;
}

function BracketFrame({ note, children }: { note: string | null; children: ReactNode }) {
	return (
		<div className="overflow-hidden rounded-[2.4rem] border border-cyan-200/14 bg-[#07140e]/92 shadow-2xl shadow-black/30">
			{children}
			<footer className="grid gap-3 border-t border-white/8 px-6 py-5 text-xs leading-5 text-emerald-100/52 sm:grid-cols-3 sm:px-8">
				<div>
					<strong className="text-emerald-50">Weg:</strong> Leuchtende Linien zeigen, wohin ein Sieger bereits weitergezogen ist.
				</div>
				<div>
					<strong className="text-emerald-50">Zweite Chance:</strong> Wer im Upper Bracket verliert, spielt im Lower Bracket weiter.
				</div>
				<div>{note ? <><strong className="text-emerald-50">Finale:</strong> {note}</> : null}</div>
			</footer>
		</div>
	);
}

function Connectors({ paths, size }: { paths: ConnectorPath[]; size: { w: number; h: number } }) {
	return (
		<svg aria-hidden className="pointer-events-none absolute inset-0 z-[1]" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
			<defs>
				<linearGradient id="bracket-route" x1="0" x2="1" y1="0" y2="0">
					<stop offset="0%" stopColor="rgb(165 243 252 / 0.6)" />
					<stop offset="100%" stopColor="rgb(190 242 100 / 0.55)" />
				</linearGradient>
			</defs>
			{paths.map((p, i) => (
				<path
					key={i}
					d={p.d}
					fill="none"
					strokeWidth={p.decided ? 2 : 1.5}
					stroke={p.decided ? "rgb(190 242 100 / 0.8)" : "url(#bracket-route)"}
					strokeOpacity={p.decided ? 1 : 0.55}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			))}
		</svg>
	);
}

function columnState(ids: string[], lookup: (id: string) => BracketMatch | undefined): "active" | "done" | "waiting" {
	const columnMatches = ids.map(lookup).filter((match): match is BracketMatch => Boolean(match));
	if (columnMatches.some((match) => match.status === "Live" || match.status === "Pending" || match.status === "Scheduled")) return "active";
	if (columnMatches.length && columnMatches.every((match) => match.status === "Finished")) return "done";
	return "waiting";
}

function BracketSection({
	label,
	tone = "neutral",
	columnLabels,
	columns,
	rows,
	rowHeight = "6rem",
	positions,
	registerCard,
	lookup,
	nextLabel,
}: {
	label: string;
	tone?: LaneTone;
	columnLabels: string[];
	columns: number;
	rows: number;
	rowHeight?: string;
	positions: Record<string, CSSProperties>;
	matches: BracketMatch[];
	registerCard: (id: string) => (el: HTMLDivElement | null) => void;
	lookup: (id: string) => BracketMatch | undefined;
	nextLabel: (match: BracketMatch) => string | null;
}) {
	const idsByColumn = Array.from({ length: columns }, (_, index) =>
		Object.entries(positions)
			.filter(([, position]) => Number(position.gridColumn) === index + 1)
			.map(([id]) => id)
	);
	// Row 1 holds the panel header, the last row is the panel's bottom padding.
	const lastRow = rows + 3;

	return (
		<section
			className="grid gap-x-4"
			style={{ gridTemplateColumns: `repeat(${columns}, ${COLUMN_WIDTH})`, gridTemplateRows: `auto repeat(${rows}, minmax(${rowHeight}, auto)) 0.75rem` }}
		>
			{idsByColumn.map((ids, index) => {
				const state = tone === "final" ? "final" : columnState(ids, lookup);
				return (
					<div
						key={`panel-${index}`}
						className={`rounded-[1.7rem] border transition ${
							state === "final"
								? "border-lime-200/16 bg-gradient-to-b from-lime-200/[0.075] to-black/15"
								: state === "active"
									? "border-cyan-200/32 bg-cyan-300/[0.07] shadow-[0_0_2rem_rgb(34_211_238/0.08)]"
									: state === "waiting"
										? "border-white/7 bg-black/10"
										: "border-white/8 bg-black/16"
						}`}
						style={{ gridColumn: index + 1, gridRow: `1 / ${lastRow}` }}
					/>
				);
			})}
			{idsByColumn.map((ids, index) => {
				const state = tone === "final" ? "final" : columnState(ids, lookup);
				return (
					<div key={`head-${index}`} className="mx-3 flex items-center justify-between gap-2 border-b border-white/8 px-1 pb-3 pt-3" style={{ gridColumn: index + 1, gridRow: 1 }}>
						<div className="min-w-0">
							<div className={`text-[8px] font-black uppercase tracking-[0.2em] ${tone === "final" ? "text-lime-100/50" : "text-cyan-100/42"}`}>{label}</div>
							<strong className="mt-1 block truncate text-sm text-emerald-50">{columnLabels[index] || label}</strong>
						</div>
						<span className="shrink-0 rounded-full border border-white/8 px-2 py-1 text-[8px] font-black text-emerald-100/38">
							{state === "active" ? "Läuft" : state === "done" ? "Fertig" : state === "final" ? "Finale" : "Folgt"}
						</span>
					</div>
				);
			})}
			{Object.entries(positions).map(([id, position]) => {
				const match = lookup(id);
				if (!match) return null;
				const row = String(position.gridRow ?? "1");
				const shifted = row.replace(/^(\d+)/, (value) => String(Number(value) + 1));
				return (
					<div key={id} className="relative z-[2] flex items-center px-3 py-1.5" style={{ gridColumn: position.gridColumn, gridRow: shifted }}>
						<div ref={registerCard(id)} className="w-full">
							<BracketCard match={match} next={nextLabel(match)} />
						</div>
					</div>
				);
			})}
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

function BracketCard({ match, next }: { match: BracketMatch; next: string | null }) {
	const winnerIsA = !!match.winner && match.winner === match.teamAName;
	const winnerIsB = !!match.winner && match.winner === match.teamBName;
	const hasScore = match.scoreA !== undefined && match.scoreB !== undefined;
	const live = match.status === "Live";
	const finished = match.status === "Finished";
	const isFinalTier = match.bracket === "Grand" || match.round === "Grand Final";
	const title = (match.layout ? generatedCardLabel(match.round) : match.round).replace(/Halbfinale/g, "HF");

	return (
		<article
			className={`rounded-2xl border p-3 shadow-lg shadow-black/15 ${
				live
					? "border-red-300/34 bg-red-500/[0.1]"
					: finished
						? "border-lime-200/20 bg-lime-200/[0.065]"
						: isFinalTier
							? "border-amber-200/18 bg-amber-200/[0.05]"
							: "border-white/10 bg-white/[0.045]"
			}`}
		>
			<div className="flex items-center justify-between gap-3">
				<span className="truncate font-mono text-sm font-black text-cyan-100" title={match.round}>
					{title}
				</span>
				<span className={`inline-flex shrink-0 items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.16em] ${live ? "text-red-100" : "text-emerald-100/38"}`}>
					{live ? <span aria-hidden className="size-1.5 rounded-full bg-red-300" /> : null}
					{STATUS_LABELS[match.status]}
					{match.bestOf && match.bestOf > 1 ? ` · Bo${match.bestOf}` : ""}
				</span>
			</div>
			{/* Two stacked lines instead of "A VS B" in one row, so full team names fit the narrower bracket columns. */}
			<div className="mt-2 divide-y divide-white/[0.06] rounded-lg border border-white/[0.07] bg-black/24 text-[11px] font-black">
				<TeamRow label={match.teamALabel} resolved={!!match.teamAName} winner={winnerIsA} score={hasScore ? match.scoreA : undefined} />
				<TeamRow label={match.teamBLabel} resolved={!!match.teamBName} winner={winnerIsB} score={hasScore ? match.scoreB : undefined} />
			</div>
			{next ? <div className="mt-2 truncate border-t border-white/8 pt-2 text-[9px] font-black leading-4 text-emerald-100/48" title={next}>{next}</div> : null}
		</article>
	);
}

function TeamRow({ label, resolved, winner, score }: { label: string; resolved: boolean; winner: boolean; score: number | undefined }) {
	return (
		<div className="flex min-h-7 items-center gap-2 px-2">
			<span className={`min-w-0 flex-1 truncate ${winner ? "text-lime-100" : resolved ? "text-emerald-50" : "font-bold text-emerald-100/34"}`} title={label}>
				{resolved ? label : compactPlaceholder(label)}
			</span>
			{score !== undefined ? <span className={`shrink-0 font-mono text-xs tabular-nums ${winner ? "text-lime-100" : "text-emerald-100/48"}`}>{score}</span> : null}
		</div>
	);
}

/** "Sieger Upper Runde 1 · Match 2" reads as "Sieger Upper R1 · M2" so it fits; the full text stays in the tooltip. */
function compactPlaceholder(label: string): string {
	const short = label
		.replace(/Runde (\d+)/g, "R$1")
		.replace(/Match (\d+)/g, "M$1")
		.replace(/Halbfinale/g, "HF")
		.replace(/^Swiss-Seed /, "Seed ");
	// Still too long for half a card: "Sieger Upper R1 · M2" becomes "Sieger UB R1·M2".
	return short.length <= 22 ? short : short.replace(/Upper /g, "UB ").replace(/Lower /g, "LB ").replace(/ · /g, "·");
}

/** Generated brackets name the round in the column header; the card only needs the part after it. */
function generatedCardLabel(round: string): string {
	const parts = round.split(" · ");
	return parts.length > 1 ? parts.at(-1)! : round;
}
