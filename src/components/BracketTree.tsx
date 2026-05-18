"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ResolvedPlayoffMatch } from "@/lib/bracket-resolver";

/** Per-section grid positions. Each sub-grid has its own row/col coordinates. */
const UB_POSITIONS: Record<string, CSSProperties> = {
  "ub-qf-1": { gridRow: "1 / span 2", gridColumn: 1 },
  "ub-qf-2": { gridRow: "3 / span 2", gridColumn: 1 },
  "ub-f":    { gridRow: "2 / span 2", gridColumn: 2 },
};

const LB_POSITIONS: Record<string, CSSProperties> = {
  "lb-r1-1": { gridRow: "1 / span 2", gridColumn: 1 },
  "lb-r1-2": { gridRow: "3 / span 2", gridColumn: 1 },
  "lb-sf":   { gridRow: "2 / span 2", gridColumn: 2 },
  "lb-f":    { gridRow: "1 / span 4", gridColumn: 3 },
};

const GF_POSITIONS_WITH_RESET: Record<string, CSSProperties> = {
  "gf":       { gridRow: "1 / span 1", gridColumn: 1 },
  "gf-reset": { gridRow: "2 / span 1", gridColumn: 1 },
};
const GF_POSITIONS_NO_RESET: Record<string, CSSProperties> = {
  "gf":       { gridRow: "1 / span 1", gridColumn: 1 },
};

type ConnectorKind = "advance" | "loserDrop" | "conditional";

type Connection = {
  from: string;
  to: string;
  port: "top" | "bottom";
  kind: ConnectorKind;
};

const CONNECTIONS: Connection[] = [
  { from: "ub-qf-1", to: "ub-f",     port: "top",    kind: "advance" },
  { from: "ub-qf-2", to: "ub-f",     port: "bottom", kind: "advance" },

  { from: "lb-r1-1", to: "lb-sf",    port: "top",    kind: "advance" },
  { from: "lb-r1-2", to: "lb-sf",    port: "bottom", kind: "advance" },

  { from: "lb-sf",   to: "lb-f",     port: "top",    kind: "advance" },
  { from: "ub-f",    to: "lb-f",     port: "bottom", kind: "loserDrop" },

  { from: "ub-f",    to: "gf",       port: "top",    kind: "advance" },
  { from: "lb-f",    to: "gf",       port: "bottom", kind: "advance" },

  { from: "gf",      to: "gf-reset", port: "top",    kind: "conditional" },
];

const UB_COLUMN_LABELS = ["Runde 1 · QF", "Upper Final"];
const LB_COLUMN_LABELS = ["Runde 1", "Lower-Halbfinale", "Lower Final"];

export function BracketTree({ matches }: { matches: ResolvedPlayoffMatch[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [paths, setPaths] = useState<Array<{ d: string; kind: ConnectorKind }>>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Bracket reset only happens if the lower-bracket side wins the first Grand Final.
  const gf = matches.find((m) => m.id === "gf");
  const showReset = !!gf && !!gf.winner && gf.winner === gf.teamBName;
  const gfPositions = showReset ? GF_POSITIONS_WITH_RESET : GF_POSITIONS_NO_RESET;
  const activeConnections = showReset
    ? CONNECTIONS
    : CONNECTIONS.filter((c) => c.to !== "gf-reset");

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    setSize({ w: containerRect.width, h: containerRect.height });

    const next: Array<{ d: string; kind: ConnectorKind }> = [];
    for (const conn of activeConnections) {
      const from = cardRefs.current.get(conn.from);
      const to = cardRefs.current.get(conn.to);
      if (!from || !to) continue;
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();

      // Same-column stack (GF → GF Reset): straight vertical line.
      if (fr.right >= tr.left - 4) {
        const x =
          (Math.min(fr.right, tr.right) + Math.max(fr.left, tr.left)) / 2 -
          containerRect.left;
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
      const y2 =
        tr.top + tr.height / 2 + (conn.port === "top" ? -yPortOffset : yPortOffset) -
        containerRect.top;

      const midX = (x1 + x2) / 2;
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${midX.toFixed(1)} ${y1.toFixed(1)} L ${midX.toFixed(1)} ${y2.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      next.push({ d, kind: conn.kind });
    }
    setPaths(next);
  }, [activeConnections]);

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
  }, [compute, matches.length, showReset]);

  const lookup = (id: string) => matches.find((m) => m.id === id);

  const registerCard = (id: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  };

  return (
    <div className="overflow-x-auto pb-2 -mx-2 px-2">
      <div
        ref={containerRef}
        className="relative grid min-w-[62rem] gap-x-10"
        style={{ gridTemplateColumns: "minmax(0, 1fr) 14rem" }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              strokeWidth={p.kind === "conditional" ? 1.5 : 2}
              strokeDasharray={p.kind === "conditional" ? "5 5" : undefined}
              stroke={
                p.kind === "loserDrop"
                  ? "rgb(244 114 182 / 0.55)"
                  : p.kind === "conditional"
                    ? "rgb(252 211 77 / 0.55)"
                    : "rgb(190 242 100 / 0.55)"
              }
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {/* Left column: stacked Upper + Lower bracket sub-grids */}
        <div className="relative z-10 flex flex-col gap-8">
          <BracketSection
            label="Upper-Bracket"
            accent="lime"
            columnLabels={UB_COLUMN_LABELS}
            columns={2}
            rows={4}
            positions={UB_POSITIONS}
            matches={matches}
            registerCard={registerCard}
            lookup={lookup}
          />

          <SectionDivider />

          <BracketSection
            label="Lower-Bracket"
            accent="sky"
            columnLabels={LB_COLUMN_LABELS}
            columns={3}
            rows={4}
            positions={LB_POSITIONS}
            matches={matches}
            registerCard={registerCard}
            lookup={lookup}
          />
        </div>

        {/* Right column: Grand Final stack */}
        <div className="relative z-10 flex flex-col justify-center">
          <BracketSection
            label="Grand Final"
            accent="amber"
            columnLabels={["Finale"]}
            columns={1}
            rows={showReset ? 2 : 1}
            positions={gfPositions}
            matches={matches}
            registerCard={registerCard}
            lookup={lookup}
          />
          {!showReset ? (
            <p className="mt-2 px-1 text-[10px] font-bold leading-relaxed text-emerald-100/40">
              Ein Bracket Reset findet nur statt, wenn das Team aus dem Lower
              Bracket das Grand Final gewinnt.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100/52">
        <LegendDot color="rgb(190 242 100 / 0.7)" label="Sieger zieht weiter" />
        <LegendDot color="rgb(244 114 182 / 0.7)" label="Verlierer fällt ins LB" />
        <LegendDot color="rgb(252 211 77 / 0.7)" label="Nur bei Bracket Reset" dashed />
      </div>
    </div>
  );
}

function SectionDivider() {
  return (
    <div
      aria-hidden
      className="relative h-px w-full bg-gradient-to-r from-transparent via-white/14 to-transparent"
    />
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
  matches: ResolvedPlayoffMatch[];
  registerCard: (id: string) => (el: HTMLDivElement | null) => void;
  lookup: (id: string) => ResolvedPlayoffMatch | undefined;
}) {
  const tone = accentClasses[accent];
  const gridCols = `repeat(${columns}, minmax(11rem, 1fr))`;

  return (
    <section>
      <div
        className={`flex items-center gap-3 px-1 pb-3 ${tone.label}`}
      >
        <span
          className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.26em] ${tone.chip}`}
        >
          {label}
        </span>
        <span className="h-px flex-1 bg-current opacity-20" />
      </div>

      <div
        className="grid gap-x-12"
        style={{ gridTemplateColumns: gridCols }}
      >
        {columnLabels.map((columnLabel, i) => (
          <div
            key={columnLabel + i}
            className="text-xs font-black uppercase tracking-[0.28em] text-emerald-100/52"
            style={{ gridColumn: i + 1 }}
          >
            {columnLabel}
          </div>
        ))}
      </div>

      <div
        className="mt-3 grid gap-x-12 gap-y-2"
        style={{
          gridTemplateColumns: gridCols,
          gridTemplateRows: `repeat(${rows}, minmax(5.5rem, auto))`,
        }}
      >
        {Object.entries(positions).map(([id, position]) => {
          const match = lookup(id);
          if (!match) return null;
          return (
            <div
              key={id}
              ref={registerCard(id)}
              className="flex items-center"
              style={position}
            >
              <BracketCard match={match} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        style={{
          width: "1.4rem",
          height: 0,
          borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
      />
      {label}
    </span>
  );
}

function BracketCard({ match }: { match: ResolvedPlayoffMatch }) {
  const winnerIsA = !!match.winner && match.winner === match.teamAName;
  const winnerIsB = !!match.winner && match.winner === match.teamBName;
  const scoreA = match.scoreA;
  const scoreB = match.scoreB;
  const hasScore = scoreA !== undefined && scoreB !== undefined;

  const isFinalTier =
    match.round === "Grand Final" || match.round === "Grand Final Reset";

  return (
    <article
      className={`flex w-full flex-col overflow-hidden rounded-2xl border shadow-xl shadow-black/24 ${
        isFinalTier
          ? "border-amber-200/30 bg-amber-200/[0.07]"
          : match.bracket === "Lower"
            ? "border-sky-200/14 bg-sky-300/[0.05]"
            : "border-lime-200/14 bg-lime-200/[0.05]"
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/8 bg-black/24 px-3 py-1.5">
        <span className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/68">
          {shortRoundLabel(match.round)}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${statusToneClass(match.status)}`}
        >
          {match.status}
        </span>
      </header>

      <TeamLine
        label={match.teamALabel}
        resolved={!!match.teamAName}
        score={scoreA}
        isWinner={winnerIsA}
        hasScore={hasScore}
      />
      <TeamLine
        label={match.teamBLabel}
        resolved={!!match.teamBName}
        score={scoreB}
        isWinner={winnerIsB}
        hasScore={hasScore}
        bottom
      />
    </article>
  );
}

function TeamLine({
  label,
  resolved,
  score,
  isWinner,
  hasScore,
  bottom,
}: {
  label: string;
  resolved: boolean;
  score: number | undefined;
  isWinner: boolean;
  hasScore: boolean;
  bottom?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 ${
        bottom ? "" : "border-b border-white/6"
      } ${isWinner ? "bg-lime-200/12" : ""}`}
    >
      <span
        className={`truncate text-sm font-black ${
          isWinner
            ? "text-lime-50"
            : resolved
              ? "text-emerald-50"
              : "italic text-emerald-100/40"
        }`}
        title={label}
      >
        {label}
      </span>
      <span
        className={`shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-xs font-black ${
          hasScore
            ? isWinner
              ? "bg-lime-200/14 text-lime-50"
              : "bg-black/24 text-emerald-100/68"
            : "bg-black/12 text-emerald-100/24"
        }`}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}

function shortRoundLabel(round: ResolvedPlayoffMatch["round"]): string {
  switch (round) {
    case "Grand Final Reset":
      return "Bracket Reset";
    case "Grand Final":
      return "Grand Final";
    case "Upper QF":
      return "Upper QF";
    case "Upper Final":
      return "Upper Final";
    case "Lower R1":
      return "Lower R1";
    case "Lower SF":
      return "Lower SF";
    case "Lower Final":
      return "Lower Final";
  }
}

function statusToneClass(status: ResolvedPlayoffMatch["status"]): string {
  switch (status) {
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
