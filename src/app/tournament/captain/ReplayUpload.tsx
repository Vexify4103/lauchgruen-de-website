"use client";

import { useRef, useState, type DragEvent } from "react";
import { parseRoflMetadata, RoflParseError, type ReplaySummary } from "@/lib/rofl";

type Evaluation = { verdict: "ok" | "review" | "reject"; problems: string[]; winner: "teamA" | "teamB" | null };

function formatDuration(seconds: number) {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function sha256Hex(buffer: ArrayBuffer) {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Captain uploads the .rofl of a finished game. The file is read in the browser; only the game data
 * (players, champions, length, result) and a checksum go to the server, never the 20+ MB file.
 */
export function ReplayUpload({
	matchId,
	teamAName,
	teamBName,
	onUploaded,
}: {
	matchId: string;
	teamAName: string;
	teamBName: string;
	/** Called after the server stored the upload, e.g. to refresh a list. */
	onUploaded?: () => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [summary, setSummary] = useState<ReplaySummary | null>(null);
	const [result, setResult] = useState<{ tone: "ok" | "warn" | "error"; text: string; problems?: string[] } | null>(null);
	const [dragging, setDragging] = useState(false);

	function onDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragging(false);
		const file = event.dataTransfer.files?.[0];
		if (file && !busy) void upload(file);
	}

	async function upload(file: File) {
		setBusy(true);
		setResult(null);
		setSummary(null);
		try {
			if (!file.name.toLowerCase().endsWith(".rofl")) throw new RoflParseError("Bitte eine .rofl-Datei aus dem Ordner „Dokumente/League of Legends/Replays“ wählen.");
			const buffer = await file.arrayBuffer();
			const parsed = parseRoflMetadata(new Uint8Array(buffer));
			setSummary(parsed);
			const response = await fetch("/api/tournament/matches/replay", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ matchId, fileName: file.name, sha256: await sha256Hex(buffer), summary: parsed }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string; evaluation?: Evaluation } | null;
			if (!response.ok) {
				setResult({ tone: "error", text: json?.message ?? "Replay konnte nicht hochgeladen werden.", problems: json?.evaluation?.problems.slice(1) });
				return;
			}
			onUploaded?.();
			const evaluation = json?.evaluation;
			const winnerName = evaluation?.winner === "teamA" ? teamAName : evaluation?.winner === "teamB" ? teamBName : null;
			setResult(
				evaluation?.verdict === "ok"
					? { tone: "ok", text: `Replay passt zum Match${winnerName ? `: Sieg für ${winnerName}` : ""}. Die Orga bestätigt das Ergebnis.` }
					: { tone: "warn", text: "Replay gespeichert. Ein paar Angaben weichen ab, die Orga prüft sie.", problems: evaluation?.problems }
			);
		} catch (error) {
			setResult({ tone: "error", text: error instanceof Error ? error.message : "Die Datei konnte nicht gelesen werden." });
		} finally {
			setBusy(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	const toneClass =
		result?.tone === "ok"
			? "border-[var(--line-strong)] text-[var(--accent)]"
			: result?.tone === "warn"
				? "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] text-[var(--amber)]"
				: "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)]";

	return (
		<section className="mt-6 border-t border-[var(--line)] pt-5" aria-labelledby={`replay-${matchId}`}>
			<h3 id={`replay-${matchId}`} className="text-base font-semibold text-[var(--text)]">
				Replay hochladen
			</h3>
			<p className="mt-1 text-sm leading-6 text-[var(--muted)]">Sieger, Spielzeit und Champions werden aus der Datei gelesen. Die Orga bestätigt das Ergebnis.</p>
			<div
				onDragEnter={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragOver={(event) => event.preventDefault()}
				onDragLeave={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
				}}
				onDrop={onDrop}
				className={`mt-4 grid place-items-center gap-3 rounded-[12px] border border-dashed px-6 py-8 text-center transition-colors ${
					dragging ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]" : "border-[var(--line-strong)]"
				}`}
			>
				<svg
					viewBox="0 0 24 24"
					width="32"
					height="32"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
					className={dragging ? "text-[var(--accent)]" : "text-[var(--muted)]"}
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<path d="m17 8-5-5-5 5" />
					<path d="M12 3v12" />
				</svg>
				<p className="text-sm text-[var(--text)]">{busy ? "Lese Replay…" : dragging ? "Loslassen zum Hochladen" : ".rofl-Datei hierher ziehen"}</p>
				<p className="text-xs text-[var(--muted)]">oder</p>
				<button
					type="button"
					disabled={busy}
					onClick={() => inputRef.current?.click()}
					className="rounded-[10px] border border-[var(--line-strong)] px-5 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
				>
					Datei wählen
				</button>
				<input
					ref={inputRef}
					type="file"
					accept=".rofl"
					className="sr-only"
					tabIndex={-1}
					aria-label="Replay-Datei wählen"
					disabled={busy}
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void upload(file);
					}}
				/>
				<p className="text-xs text-[var(--muted)]">
					Zu finden unter <span className="font-mono">Dokumente/League of Legends/Replays</span>
				</p>
			</div>
			{summary ? (
				<p className="mt-3 font-mono text-xs tabular-nums text-[var(--muted)]">
					Spielzeit {formatDuration(summary.durationSeconds)} · Patch {summary.gameVersion?.split(".").slice(0, 2).join(".") ?? "?"} · {summary.players.length} Spieler
				</p>
			) : null}
			{result ? (
				<div role="status" className={`mt-3 rounded-[10px] border px-3 py-2 text-sm leading-6 ${toneClass}`}>
					{result.text}
					{result.problems?.length ? (
						<ul className="mt-1 list-disc pl-4 text-[var(--muted)]">
							{result.problems.map((problem) => (
								<li key={problem}>{problem}</li>
							))}
						</ul>
					) : null}
				</div>
			) : null}
		</section>
	);
}
