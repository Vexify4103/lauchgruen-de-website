"use client";

import { useEffect, useState } from "react";
import type { ControlMatch } from "@/lib/match-control";
import type { TournamentReplay } from "@/lib/tournament-replays";
import { ReplayUpload } from "../../../captain/ReplayUpload";
import type { ReplayAssets } from "@/lib/replay-assets";
import { ReplayScoreboard } from "@/components/ReplayScoreboard";

type CaptainReport = {
	id: string;
	teamName: string;
	declaredWinner: boolean;
	gameDuration?: string;
	screenshotUrl?: string;
	note?: string;
	createdAt: string;
};

export type ReplayPrefill = { winner: "teamA" | "teamB"; durationSeconds: number; gameNumber: number };

const VERDICT_LABEL = { ok: "Passt", review: "Prüfen", reject: "Abgelehnt" } as const;
const STATUS_LABEL = { pending: "Offen", applied: "Übernommen", rejected: "Abgelehnt" } as const;

/**
 * Replays and match reports the captains sent for this match. "Übernehmen" only fills the result form;
 * staff still save it there, so every result runs through the usual checks (series, Swiss lock).
 */
export function ReplayReviewPanel({ match, onApply }: { match: ControlMatch; onApply: (prefill: ReplayPrefill) => void }) {
	const [replays, setReplays] = useState<TournamentReplay[]>([]);
	const [reports, setReports] = useState<CaptainReport[]>([]);
	const [message, setMessage] = useState("");
	const [busyId, setBusyId] = useState<string | null>(null);
	const [reload, setReload] = useState(0);
	const [assets, setAssets] = useState<ReplayAssets | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const response = await fetch(`/api/tournament/matches/replay?matchId=${encodeURIComponent(match.id)}`, { cache: "no-store" }).catch(() => null);
			const json = (await response?.json().catch(() => null)) as { replays?: TournamentReplay[]; reports?: CaptainReport[]; assets?: ReplayAssets | null } | null;
			if (cancelled || !json) return;
			setReplays(json.replays ?? []);
			setReports(json.reports ?? []);
			setAssets(json.assets ?? null);
		})();
		return () => {
			cancelled = true;
		};
	}, [match.id, reload]);

	async function review(replay: TournamentReplay, status: "applied" | "rejected") {
		setBusyId(replay.id);
		const response = await fetch("/api/tournament/matches/replay", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ id: replay.id, status }),
		}).catch(() => null);
		setBusyId(null);
		if (!response?.ok) return setMessage("Status konnte nicht gespeichert werden.");
		if (status === "applied" && replay.evaluation.winner) {
			onApply({ winner: replay.evaluation.winner, durationSeconds: replay.summary.durationSeconds, gameNumber: replay.gameNumber });
			setMessage(`Werte aus der Replay eingetragen. Jetzt ${match.bestOf > 1 ? `Spiel ${replay.gameNumber} speichern` : "„Match speichern“ klicken"}.`);
		} else setMessage(status === "rejected" ? "Replay abgelehnt. Der Captain kann eine andere hochladen." : "");
		setReload((value) => value + 1);
	}

	const teamLabel = (side: "teamA" | "teamB" | null) => (side === "teamA" ? match.teamALabel : side === "teamB" ? match.teamBLabel : "?");

	return (
		<section className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-4" aria-labelledby={`replays-${match.id}`}>
			<h3 id={`replays-${match.id}`} className="m-0 text-sm font-semibold text-[var(--text)]">
				Replays und Reports der Captains
			</h3>
			{!replays.length && !reports.length ? <p className="mt-2 text-xs text-[var(--muted)]">Noch nichts hochgeladen.</p> : null}
			<ul className="mt-3 grid list-none gap-2 p-0">
				{replays.map((replay) => (
					<li key={replay.id} className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3">
						<div className="flex items-center justify-between gap-2">
							<strong className="text-sm font-semibold text-[var(--text)]">Replay · Spiel {replay.gameNumber}</strong>
							<span
								className="tally"
								data-tone={replay.status === "applied" ? "ok" : replay.status === "rejected" ? undefined : replay.evaluation.verdict === "ok" ? "ok" : "warn"}
							>
								{replay.status === "pending" ? VERDICT_LABEL[replay.evaluation.verdict] : STATUS_LABEL[replay.status]}
							</span>
						</div>
						<div className="mt-1 text-xs text-[var(--muted)]">
							{replay.uploaderLabel} · {new Date(replay.createdAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}
							{replay.gameId ? ` · Game ${replay.gameId}` : ""}
						</div>
						<div className="mt-1 text-xs text-[var(--muted)]">
							Sieger <strong className="text-[var(--text)]">{teamLabel(replay.evaluation.winner)}</strong> · {replay.evaluation.matchedPlayers}/10 Spieler erkannt
						</div>
						{replay.evaluation.problems.length ? (
							<ul className="mt-2 list-disc pl-4 text-xs leading-5 text-[var(--amber)]">
								{replay.evaluation.problems.map((problem) => (
									<li key={problem}>{problem}</li>
								))}
							</ul>
						) : null}
						{replay.status === "pending" ? (
							<div className="mt-3 flex gap-2">
								<button
									type="button"
									disabled={busyId === replay.id || !replay.evaluation.winner || replay.gameNumber !== match.games.length + 1}
									onClick={() => void review(replay, "applied")}
									className="button primary small"
								>
									Ergebnis übernehmen
								</button>
								<button type="button" disabled={busyId === replay.id} onClick={() => void review(replay, "rejected")} className="button ghost small !text-[var(--danger)]">
									Ablehnen
								</button>
							</div>
						) : null}
						{replay.status === "rejected" ? (
							<details className="mt-3 text-xs">
								<summary className="cursor-pointer text-[var(--muted)]">Scoreboard der abgelehnten Replay</summary>
								<div className="mt-3">
								<ReplayScoreboard
							summary={replay.summary}
							assets={assets}
							blueTeamName={teamLabel(replay.evaluation.blueTeam)}
							redTeamName={teamLabel(replay.evaluation.blueTeam === "teamA" ? "teamB" : replay.evaluation.blueTeam === "teamB" ? "teamA" : null)}
							fileName={replay.fileName}
						/>
								</div>
							</details>
						) : (
							<div className="mt-4">
							<ReplayScoreboard
							summary={replay.summary}
							assets={assets}
							blueTeamName={teamLabel(replay.evaluation.blueTeam)}
							redTeamName={teamLabel(replay.evaluation.blueTeam === "teamA" ? "teamB" : replay.evaluation.blueTeam === "teamB" ? "teamA" : null)}
							fileName={replay.fileName}
						/>
							</div>
						)}
					</li>
				))}
				{reports.map((report) => (
					<li key={report.id} className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3 text-xs">
						<div className="flex items-center justify-between gap-2">
							<strong className="text-sm font-semibold text-[var(--text)]">Report · {report.teamName}</strong>
							<span className="text-[var(--muted)]">
								{new Date(report.createdAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}
							</span>
						</div>
						<div className="mt-1 text-[var(--text)]">
							{report.declaredWinner ? "Meldet einen Sieg" : "Meldet eine Niederlage"}
							{report.gameDuration ? ` · ${report.gameDuration}` : ""}
						</div>
						{report.note ? <p className="mt-1 text-[var(--muted)]">{report.note}</p> : null}
						{report.screenshotUrl ? (
							<a href={report.screenshotUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[var(--accent)] underline underline-offset-4">
								Screenshot öffnen
							</a>
						) : null}
					</li>
				))}
			</ul>
			{message ? (
				<p role="status" className="mt-3 text-xs text-[var(--muted)]">
					{message}
				</p>
			) : null}
			{/* Staff can upload too, for testing or when a captain sends the file another way. */}
			{match.teamAName && match.teamBName && match.status !== "Finished" ? (
				<ReplayUpload matchId={match.id} teamAName={match.teamAName} teamBName={match.teamBName} onUploaded={() => setReload((value) => value + 1)} showScoreboard={false} />
			) : null}
		</section>
	);
}
