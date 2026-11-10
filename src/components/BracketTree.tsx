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

type ConnectorPath = { d: string; kind: ConnectorKind; decided: boolean; from: string; to: string };
export type BracketMatch = {
	id: string;
	bracket?: "Upper" | "Lower" | "Grand";
	round: string;
	teamAName: string | null;
	teamBName: string | null;
	teamALabel: string;
	teamBLabel: string;
	/** Short team tags; shown instead of the full name. */
	teamATag?: string | null;
	teamBTag?: string | null;
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
	const [selected, setSelected] = useState<string | null>(null);
	const select = (name: string | null) => setSelected((current) => (!name || current === name ? null : name));
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
					from: conn.from,
					to: conn.to,
				});
				continue;
			}

			const x1 = fr.right - containerRect.left;
			const y1 = fr.top + fr.height / 2 - containerRect.top;
			const x2 = tr.left - containerRect.left;
			const yPortOffset = tr.height * 0.22;
			const y2 = tr.top + tr.height / 2 + (conn.port === "top" ? -yPortOffset : conn.port === "bottom" ? yPortOffset : 0) - containerRect.top;

			const midX = (x1 + x2) / 2;
			const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${midX.toFixed(1)} ${y1.toFixed(1)}, ${midX.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
			next.push({ d, kind: conn.kind, decided, from: conn.from, to: conn.to });
		}
		setPaths((prev) => (prev.length === next.length && prev.every((path, index) => path.d === next[index]?.d && path.decided === next[index]?.decided && path.from === next[index]?.from) ? prev : next));
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
	const involves = (match: BracketMatch | undefined) => Boolean(selected && match && (match.teamAName === selected || match.teamBName === selected));
	// A connector is on the team's path when the team won the earlier match and plays the next one.
	const onPath = (path: ConnectorPath) => {
		const from = lookup(path.from);
		return Boolean(selected && from?.winner === selected && involves(lookup(path.to)));
	};
	const teams = [...new Map(matches.flatMap((match) => [[match.teamAName, match.teamATag], [match.teamBName, match.teamBTag]] as const).filter(([name]) => name)).entries()]
		.map(([name, tag]) => ({ name: name!, tag: tag || name!.slice(0, 4).toUpperCase() }))
		.sort((a, b) => a.tag.localeCompare(b.tag));
	const view = { selected, select, involves };
	const picker = teams.length ? <TeamPicker teams={teams} selected={selected} onSelect={select} /> : null;

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
					rowHeight="3.4rem"
					positions={entry.positions}
					matches={matches}
					registerCard={registerCard}
					lookup={lookup}
					nextLabel={nextLabel}
					view={view}
				/>
			) : null;
		return (
			<BracketFrame
				picker={picker}
				note={lower && finals ? (hasReset ? "Gewinnt das Team aus dem Lower Bracket das Grand Final, folgt ein Bracket Reset." : "Das Grand Final ist ein einzelnes Do-or-die-Match ohne Bracket Reset.") : null}
			>
				<div ref={scrollRef} className="themed-scrollbar overflow-x-auto pb-2">
					<div ref={containerRef} className="relative mx-auto grid w-max gap-x-10" style={{ gridTemplateColumns: leftColumns ? "max-content max-content" : "max-content" }}>
						<Connectors paths={paths} size={size} onPath={onPath} dim={Boolean(selected)} />
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
		<BracketFrame picker={picker} note="Das Grand Final ist ein einzelnes Do-or-die-Match ohne Bracket Reset.">
			<div ref={scrollRef} className="themed-scrollbar overflow-x-auto pb-2">
				<div ref={containerRef} className="relative mx-auto grid w-max gap-x-10" style={{ gridTemplateColumns: "max-content max-content" }}>
					<Connectors paths={paths} size={size} onPath={onPath} dim={Boolean(selected)} />
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
							view={view}
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
								view={view}
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
							view={view}
						/>
					</div>
				</div>
			</div>
		</BracketFrame>
	);
}

const COLUMN_WIDTH = "11.5rem";

type LaneTone = "neutral" | "final";
type View = { selected: string | null; select: (name: string | null) => void; involves: (match: BracketMatch | undefined) => boolean };

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

function TeamPicker({ teams, selected, onSelect }: { teams: Array<{ name: string; tag: string }>; selected: string | null; onSelect: (name: string | null) => void }) {
	return (
		<div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Team hervorheben">
			{teams.map((team) => (
				<button
					key={team.name}
					type="button"
					onClick={() => onSelect(team.name)}
					aria-pressed={selected === team.name}
					title={team.name}
					className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
						selected === team.name
							? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text)]"
							: "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
					}`}
				>
					<span className="font-mono font-semibold text-[var(--text)]">{team.tag}</span>
					<span className="max-w-[10rem] truncate">{team.name}</span>
				</button>
			))}
		</div>
	);
}

function BracketFrame({ note, picker, children }: { note: string | null; picker?: ReactNode; children: ReactNode }) {
	return (
		<div className="grid gap-4">
			{picker}
			{children}
			{note ? <p className="text-center text-xs text-[var(--muted)]">{note}</p> : null}
		</div>
	);
}

function Connectors({ paths, size, onPath, dim }: { paths: ConnectorPath[]; size: { w: number; h: number }; onPath: (path: ConnectorPath) => boolean; dim: boolean }) {
	return (
		<svg aria-hidden className="pointer-events-none absolute inset-0 z-[1]" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
			{paths.map((path, index) => {
				const highlighted = onPath(path);
				return (
					<path
						key={index}
						d={path.d}
						fill="none"
						strokeWidth={highlighted ? 2.5 : 1.5}
						stroke={highlighted ? "var(--accent)" : path.decided ? "color-mix(in srgb, var(--accent) 45%, var(--line-strong))" : "var(--line-strong)"}
						strokeOpacity={dim && !highlighted ? 0.35 : 1}
						strokeLinecap="round"
					/>
				);
			})}
		</svg>
	);
}

function BracketSection({
	label,
	tone = "neutral",
	columnLabels,
	columns,
	rows,
	rowHeight = "5.2rem",
	positions,
	registerCard,
	lookup,
	nextLabel,
	view,
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
	view: View;
}) {
	return (
		<section aria-label={label} className="grid gap-x-10" style={{ gridTemplateColumns: `repeat(${columns}, ${COLUMN_WIDTH})`, gridTemplateRows: `auto repeat(${rows}, minmax(${rowHeight}, auto))` }}>
			{Array.from({ length: columns }, (_, index) => (
				<h3 key={`head-${index}`} className={`pb-2 text-center text-xs font-medium ${tone === "final" ? "text-[var(--amber)]" : "text-[var(--muted)]"}`} style={{ gridColumn: index + 1, gridRow: 1 }}>
					{columnLabels[index] || label}
				</h3>
			))}
			{Object.entries(positions).map(([id, position]) => {
				const match = lookup(id);
				if (!match) return null;
				const row = String(position.gridRow ?? "1");
				const shifted = row.replace(/^(\d+)/, (value) => String(Number(value) + 1));
				return (
					<div key={id} className="relative z-[2] flex items-center py-1" style={{ gridColumn: position.gridColumn, gridRow: shifted }}>
						<div ref={registerCard(id)} className="w-full">
							<BracketCard match={match} next={nextLabel(match)} final={tone === "final"} view={view} />
						</div>
					</div>
				);
			})}
		</section>
	);
}

function BracketCard({ match, next, final, view }: { match: BracketMatch; next: string | null; final: boolean; view: View }) {
	const winnerIsA = !!match.winner && match.winner === match.teamAName;
	const winnerIsB = !!match.winner && match.winner === match.teamBName;
	const hasScore = match.scoreA !== undefined && match.scoreB !== undefined;
	const live = match.status === "Live";
	const title = (match.layout ? generatedCardLabel(match.round) : match.round).replace(/Halbfinale/g, "HF");
	const highlighted = view.involves(match);
	const dimmed = Boolean(view.selected) && !highlighted;
	return (
		<article
			title={next ? `${match.round} · ${next}` : match.round}
			className={`overflow-hidden rounded-lg border bg-[var(--panel-solid)] transition-opacity ${dimmed ? "opacity-35" : ""} ${
				highlighted
					? "border-[var(--accent)]"
					: live
						? "border-[color-mix(in_srgb,var(--live)_60%,var(--line))]"
						: final
							? "border-[color-mix(in_srgb,var(--amber)_45%,var(--line))]"
							: "border-[var(--line)]"
			}`}
		>
			<div className="flex items-center justify-between gap-2 bg-[var(--bg-soft)] px-2.5 py-1 text-[11px]">
				<span className="truncate font-medium text-[var(--text)]">{compactPlaceholder(title)}</span>
				<span className={`shrink-0 ${live ? "font-semibold text-[var(--live)]" : "text-[var(--muted)]"}`}>
					{live ? "Live" : match.bestOf && match.bestOf > 1 ? `Bo${match.bestOf}` : "Bo1"}
					{match.conditional ? " · falls nötig" : ""}
				</span>
			</div>
			<TeamRow name={match.teamAName} tag={match.teamATag} label={match.teamALabel} winner={winnerIsA} loser={winnerIsB} score={hasScore ? match.scoreA : undefined} view={view} />
			<TeamRow name={match.teamBName} tag={match.teamBTag} label={match.teamBLabel} winner={winnerIsB} loser={winnerIsA} score={hasScore ? match.scoreB : undefined} view={view} />
		</article>
	);
}

function TeamRow({
	name,
	tag,
	label,
	winner,
	loser,
	score,
	view,
}: {
	name: string | null;
	tag?: string | null;
	label: string;
	winner: boolean;
	loser: boolean;
	score: number | undefined;
	view: View;
}) {
	const shown = name ? tag || name.slice(0, 4).toUpperCase() : "TBD";
	return (
		<div className={`flex h-7 items-center gap-2 border-t border-[var(--line)] px-2.5 text-sm ${view.selected && name === view.selected ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : ""}`}>
			{name ? (
				<button
					type="button"
					onClick={() => view.select(name)}
					title={name}
					className={`min-w-0 flex-1 truncate text-left font-mono font-semibold hover:underline ${winner ? "text-[var(--accent)]" : loser ? "text-[var(--muted)]" : "text-[var(--text)]"}`}
				>
					{shown}
				</button>
			) : (
				<span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]" title={label}>
					{compactPlaceholder(label)}
				</span>
			)}
			<span className={`shrink-0 font-mono text-sm tabular-nums ${winner ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{score ?? "–"}</span>
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
