"use client";

import { useRef, useState } from "react";
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
export function ReplayUpload({ matchId, teamAName, teamBName }: { matchId: string; teamAName: string; teamBName: string }) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [summary, setSummary] = useState<ReplaySummary | null>(null);
	const [result, setResult] = useState<{ tone: "ok" | "warn" | "error"; text: string; problems?: string[] } | null>(null);

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
			? "border-lime-200/24 bg-lime-200/10 text-lime-100"
			: result?.tone === "warn"
				? "border-amber-200/24 bg-amber-200/10 text-amber-100"
				: "border-red-300/24 bg-red-400/10 text-red-100";

	return (
		<div className="mt-4 rounded-2xl border border-white/10 bg-black/18 p-4">
			<div className="text-sm font-bold text-emerald-50">Replay hochladen</div>
			<p className="mt-1 text-xs leading-5 text-emerald-100/60">
				Nach dem Spiel die .rofl-Datei wählen (im Client unter Verlauf → Replay herunterladen, gespeichert in „Dokumente/League of Legends/Replays“). Sieger,
				Spielzeit und Champions werden daraus gelesen.
			</p>
			<label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-xs font-bold text-emerald-50 hover:border-lime-200/30">
				<input
					ref={inputRef}
					type="file"
					accept=".rofl"
					className="sr-only"
					disabled={busy}
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void upload(file);
					}}
				/>
				{busy ? "Lese Replay…" : "Datei wählen"}
			</label>
			{summary ? (
				<div className="mt-3 text-xs text-emerald-100/70">
					Spielzeit {formatDuration(summary.durationSeconds)} · Patch {summary.gameVersion?.split(".").slice(0, 2).join(".") ?? "?"} · {summary.players.length} Spieler
				</div>
			) : null}
			{result ? (
				<div role="status" className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${toneClass}`}>
					{result.text}
					{result.problems?.length ? (
						<ul className="mt-1 list-disc pl-4">
							{result.problems.map((problem) => (
								<li key={problem}>{problem}</li>
							))}
						</ul>
					) : null}
				</div>
			) : null}
		</div>
	);
}
