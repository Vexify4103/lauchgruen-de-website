"use client";

import { TournamentLink as Link } from "@/app/tournament/TournamentLink";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { compactPoolLabel, type WheelMatchAssignment } from "@/lib/tournament-wheel-shared";
import { resolveBracketFocusMatchId } from "@/lib/tournament-stage-focus";

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

type ConnectorPath = { d: string; kind: ConnectorKind };
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
};

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

export function BracketTree({ matches }: { matches: BracketMatch[] }) {
	const matchIds = matches.map((match) => match.id).join("|");
	const layout = buildBracketLayout(new Set(matches.map((match) => match.id)));
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
		const connections = buildBracketLayout(new Set(matchIds.split("|").filter(Boolean))).connections;
		for (const conn of connections) {
			const from = cardRefs.current.get(conn.from);
			const to = cardRefs.current.get(conn.to);
			if (!from || !to) continue;
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
			next.push({ d, kind: conn.kind });
		}
		setPaths((prev) => (prev.length === next.length && prev.every((path, index) => path.d === next[index]?.d && path.kind === next[index]?.kind) ? prev : next));
	}, [matchIds]);

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

	return (
		<div ref={scrollRef} className="overflow-x-auto pb-2 -mx-2 px-2">
			<div ref={containerRef} className="relative grid min-w-[52rem] gap-x-6" style={{ gridTemplateColumns: "minmax(34rem, 1fr) 14rem" }}>
				<svg aria-hidden className="pointer-events-none absolute inset-0 -z-0" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
					{paths.map((p, i) => (
						<path key={i} d={p.d} fill="none" strokeWidth={2} stroke="rgb(190 242 100 / 0.55)" strokeLinecap="round" strokeLinejoin="round" />
					))}
				</svg>

				{/* Left column: stacked Upper + Lower bracket sub-grids */}
				<div className="relative z-10 flex flex-col gap-8">
					<BracketSection
						label="Upper-Bracket"
						accent="lime"
						columnLabels={layout.upperLabels}
						columns={layout.upperColumns}
						rows={layout.upperRows}
						positions={layout.upperPositions}
						matches={matches}
						registerCard={registerCard}
						lookup={lookup}
					/>

					{matches.some((match) => match.bracket === "Lower") ? (
						<BracketSection
							label="Lower-Bracket"
							accent="sky"
							columnLabels={layout.lowerLabels}
							columns={layout.lowerColumns}
							rows={4}
							positions={layout.lowerPositions}
							matches={matches}
							registerCard={registerCard}
							lookup={lookup}
						/>
					) : null}
				</div>

				{/* Right column: Grand Final stack */}
				<div className="relative z-10 flex flex-col justify-center">
					<BracketSection
						label="Grand Final"
						accent="amber"
						columnLabels={["Finale"]}
						columns={1}
						rows={1}
						positions={GF_POSITIONS}
						matches={matches}
						registerCard={registerCard}
						lookup={lookup}
					/>
				</div>
			</div>

			<div className="mt-4 flex flex-wrap gap-3 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100/52">
				<LegendDot color="rgb(190 242 100 / 0.7)" label="Sieger zieht weiter" />
				<span>Grand Final · ein Do-or-die-Match ohne Bracket Reset</span>
			</div>
		</div>
	);
}

type Accent = "lime" | "sky" | "amber";

const accentClasses: Record<Accent, { label: string; chip: string }> = {
	lime: {
		label: "text-lime-200/76",
		chip: "border-lime-200/30 bg-lime-200/12 text-lime-100",
	},
	sky: {
		label: "text-sky-200/76",
		chip: "border-sky-200/30 bg-sky-300/14 text-sky-100",
	},
	amber: {
		label: "text-amber-200/76",
		chip: "border-amber-200/30 bg-amber-200/12 text-amber-100",
	},
};

function BracketSection({
	label,
	accent,
	columnLabels,
	columns,
	rows,
	positions,
	registerCard,
	lookup,
}: {
	label: string;
	accent: Accent;
	columnLabels: string[];
	columns: number;
	rows: number;
	positions: Record<string, CSSProperties>;
	matches: BracketMatch[];
	registerCard: (id: string) => (el: HTMLDivElement | null) => void;
	lookup: (id: string) => BracketMatch | undefined;
}) {
	const tone = accentClasses[accent];
	const gridCols = `repeat(${columns}, minmax(9rem, 1fr))`;

	return (
		<section>
			<div className={`flex items-center gap-3 px-1 pb-3 ${tone.label}`}>
				<span className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.26em] ${tone.chip}`}>{label}</span>
				<span className="h-px flex-1 bg-current opacity-20" />
			</div>

			<div className="grid gap-x-8" style={{ gridTemplateColumns: gridCols }}>
				{columnLabels.map((columnLabel, i) => (
					<div key={columnLabel + i} className="text-xs font-black uppercase tracking-[0.28em] text-emerald-100/52" style={{ gridColumn: i + 1 }}>
						{columnLabel}
					</div>
				))}
			</div>

			<div
				className="mt-3 grid gap-x-8 gap-y-2"
				style={{
					gridTemplateColumns: gridCols,
					gridTemplateRows: `repeat(${rows}, minmax(5.5rem, auto))`,
				}}
			>
				{Object.entries(positions).map(([id, position]) => {
					const match = lookup(id);
					if (!match) return null;
					return (
						<div key={id} ref={registerCard(id)} className="flex items-center" style={position}>
							<BracketCard match={match} />
						</div>
					);
				})}
			</div>
		</section>
	);
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span
				aria-hidden
				style={{
					width: "1.4rem",
					height: 0,
					borderTop: `2px solid ${color}`,
				}}
			/>
			{label}
		</span>
	);
}

function BracketCard({ match }: { match: BracketMatch }) {
	const winnerIsA = !!match.winner && match.winner === match.teamAName;
	const winnerIsB = !!match.winner && match.winner === match.teamBName;
	const scoreA = match.scoreA;
	const scoreB = match.scoreB;
	const hasScore = scoreA !== undefined && scoreB !== undefined;

	const isFinalTier = match.round === "Grand Final";

	return (
		<article
			className={`flex w-full flex-col overflow-hidden rounded-2xl border shadow-xl shadow-black/24 ${
				match.status === "Live"
					? "border-red-300/34 bg-red-500/12 shadow-red-950/25"
					: isFinalTier
						? "border-amber-200/30 bg-amber-200/[0.07]"
						: match.bracket === "Lower"
							? "border-sky-200/14 bg-sky-300/[0.05]"
							: "border-lime-200/14 bg-lime-200/[0.05]"
			}`}
		>
			<header className="flex items-center justify-between gap-2 border-b border-white/8 bg-black/24 px-3 py-1.5">
				<span className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/68">{shortRoundLabel(match.round)}</span>
				<span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${statusToneClass(match.status)}`}>
					{match.status}
				</span>
			</header>

			<TeamLine
				label={match.teamALabel}
				resolved={!!match.teamAName}
				score={scoreA}
				isWinner={winnerIsA}
				hasScore={hasScore}
				pool={match.poolAssignment?.teamAPool ?? null}
			/>
			<TeamLine
				label={match.teamBLabel}
				resolved={!!match.teamBName}
				score={scoreB}
				isWinner={winnerIsB}
				hasScore={hasScore}
				pool={match.poolAssignment?.teamBPool ?? null}
				bottom
			/>
			<footer className="flex flex-wrap items-center gap-2 border-t border-white/6 bg-black/18 px-3 py-1.5">
				{match.status === "Live" ? (
					<span className="rounded-full border border-red-300/30 bg-red-500/16 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-red-100">Current</span>
				) : null}
				{match.poolAssignment ? (
					<Link
						href={`/tournament/champ-select/${match.id}/spectate`}
						className="rounded-full border border-sky-200/20 bg-sky-300/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-sky-50/82"
					>
						Draft bereit
					</Link>
				) : (
					<span className="rounded-full border border-white/10 bg-black/18 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/34">
						Keine Pools
					</span>
				)}
			</footer>
		</article>
	);
}

function TeamLine({
	label,
	resolved,
	score,
	isWinner,
	hasScore,
	pool,
	bottom,
}: {
	label: string;
	resolved: boolean;
	score: number | undefined;
	isWinner: boolean;
	hasScore: boolean;
	pool: string | null;
	bottom?: boolean;
}) {
	return (
		<div className={`relative flex items-center gap-2 px-3 py-2 ${bottom ? "" : "border-b border-white/6"} ${isWinner ? "bg-lime-200/12" : ""}`}>
			<span
				className={`min-w-0 max-w-[44%] truncate text-sm font-black ${isWinner ? "text-lime-50" : resolved ? "text-emerald-50" : "italic text-emerald-100/40"}`}
				title={label}
			>
				{label}
			</span>
			{pool ? (
				<span className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-md border border-lime-200/16 bg-lime-200/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-lime-50/78">
					{compactPoolLabel(pool)}
				</span>
			) : null}
			<span
				className={`ml-auto shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-xs font-black ${
					hasScore ? (isWinner ? "bg-lime-200/14 text-lime-50" : "bg-black/24 text-emerald-100/68") : "bg-black/12 text-emerald-100/24"
				}`}
			>
				{score ?? "—"}
			</span>
		</div>
	);
}

function shortRoundLabel(round: string): string {
	switch (round) {
		case "Grand Final":
			return "Grand Final";
		case "Upper R1":
			return "Upper R1";
		case "Upper R2":
			return "Upper R2";
		case "Upper Final":
			return "Upper Final";
		case "Lower R1":
			return "Lower R1";
		case "Lower R2":
			return "Lower R2";
		case "Lower SF":
			return "Lower SF";
		case "Lower Final":
			return "Lower Final";
		default:
			return round;
	}
}

function statusToneClass(status: BracketMatch["status"]): string {
	switch (status) {
		case "Scheduled":
			return "border-white/10 bg-black/24 text-emerald-100/80";
		case "Live":
			return "border-red-300/40 bg-red-500/20 text-red-100";
		case "Finished":
			return "border-lime-200/30 bg-lime-200/14 text-lime-50";
		case "Pending":
			return "border-amber-200/30 bg-amber-200/12 text-amber-100";
		case "Locked":
			return "border-white/10 bg-black/40 text-emerald-100/52";
	}
}
