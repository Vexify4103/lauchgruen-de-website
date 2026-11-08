"use client";

import { useEffect, useState } from "react";
import type { ControlMatch } from "@/lib/match-control";
import { formatGameDuration } from "@/lib/match-duration";
import type { TournamentReplay } from "@/lib/tournament-replays";

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

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const response = await fetch(`/api/tournament/matches/replay?matchId=${encodeURIComponent(match.id)}`, { cache: "no-store" }).catch(() => null);
			const json = (await response?.json().catch(() => null)) as { replays?: TournamentReplay[]; reports?: CaptainReport[] } | null;
			if (cancelled || !json) return;
			setReplays(json.replays ?? []);
			setReports(json.reports ?? []);
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

	if (!replays.length && !reports.length) return null;
	const teamLabel = (side: "teamA" | "teamB" | null) => (side === "teamA" ? match.teamALabel : side === "teamB" ? match.teamBLabel : "?");

	return (
		<section className="rounded-[16px] border border-[var(--line)] bg-[var(--admin-step)] p-4" aria-labelledby={`replays-${match.id}`}>
			<div className="text-xs font-semibold text-[var(--muted)]">Von den Captains</div>
			<h3 id={`replays-${match.id}`} className="mt-1 text-lg font-semibold text-[var(--text)]">
				Replays und Reports
			</h3>
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
						<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
							<dt className="text-[var(--muted)]">Sieger</dt>
							<dd className="font-medium text-[var(--text)]">{teamLabel(replay.evaluation.winner)}</dd>
							<dt className="text-[var(--muted)]">Spielzeit</dt>
							<dd className="font-mono tabular-nums text-[var(--text)]">{formatGameDuration(replay.summary.durationSeconds)}</dd>
							<dt className="text-[var(--muted)]">Spieler erkannt</dt>
							<dd className="font-mono tabular-nums text-[var(--text)]">{replay.evaluation.matchedPlayers}/10</dd>
							<dt className="text-[var(--muted)]">Blau</dt>
							<dd className="text-[var(--text)]">{teamLabel(replay.evaluation.blueTeam)}</dd>
						</dl>
						<details className="mt-2 text-xs">
							<summary className="cursor-pointer text-[var(--muted)]">Champions und KDA</summary>
							<table className="mt-2 w-full text-left">
								<tbody>
									{replay.summary.players.map((player) => (
										<tr key={`${player.team}-${player.puuid || player.riotIdName}`} className="border-t border-[var(--line)]">
											<td className="py-1 pr-2 text-[var(--muted)]">{player.team === 100 ? "Blau" : "Rot"}</td>
											<td className="py-1 pr-2 text-[var(--text)]">{player.champion}</td>
											<td className="truncate py-1 pr-2 text-[var(--muted)]">{player.riotIdName}</td>
											<td className="py-1 text-right font-mono tabular-nums text-[var(--text)]">
												{player.kills}/{player.deaths}/{player.assists}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</details>
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
		</section>
	);
}
