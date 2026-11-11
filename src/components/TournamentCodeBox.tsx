"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Riot tournament code for the current game. Rendered only for the match's captains and admins.
 * `retry` adds the admin button that creates a missing code.
 */
export function TournamentCodeBox({
	code,
	gameNumber,
	stub,
	matchId,
	retry = false,
}: {
	code: string | null;
	gameNumber: number;
	stub: boolean;
	matchId: string;
	retry?: boolean;
}) {
	const router = useRouter();
	const [copied, setCopied] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	async function copy() {
		if (!code) return;
		await navigator.clipboard.writeText(code).catch(() => undefined);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	}

	async function create(renew = false) {
		if (renew && !window.confirm("Neuen Code erzeugen? Der alte Code gilt dann nicht mehr als aktueller Code (z. B. für ein Remake).")) return;
		setBusy(true);
		setError("");
		const response = await fetch("/api/tournament/matches/code", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ matchId, renew }),
		}).catch(() => null);
		const json = (await response?.json().catch(() => null)) as { message?: string } | null;
		setBusy(false);
		if (!response?.ok) return setError(json?.message ?? "Code konnte nicht erzeugt werden.");
		router.refresh();
	}

	return (
		<section className="rounded-xl border border-[var(--line)] p-4" aria-label={`Turniercode Spiel ${gameNumber}`}>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="m-0 text-xs text-[var(--muted)]">
						Turniercode · Spiel {gameNumber}
						{stub ? " · Testcode, öffnet keine echte Lobby" : ""}
					</p>
					{code ? (
						<code className="mt-1 block font-mono text-sm break-all text-[var(--text)]">{code}</code>
					) : (
						<p className="m-0 mt-1 text-sm text-[var(--muted)]">Noch kein Code erzeugt.</p>
					)}
				</div>
				<div className="flex gap-2">
					{code ? (
						<button type="button" onClick={() => void copy()} className="button ghost small">
							{copied ? "Kopiert" : "Code kopieren"}
						</button>
					) : null}
					{retry && !code ? (
						<button type="button" disabled={busy} onClick={() => void create()} className="button primary small">
							{busy ? "Erzeuge…" : "Code erzeugen"}
						</button>
					) : null}
					{retry && code ? (
						<button type="button" disabled={busy} onClick={() => void create(true)} className="button ghost small">
							{busy ? "Erzeuge…" : "Neuer Code"}
						</button>
					) : null}
				</div>
			</div>
			{code ? (
				<p className="m-0 mt-2 text-xs leading-5 text-[var(--muted)]">
					Teilt den Code mit eurem Team. Alle zehn Spieler geben ihn im League-Client unter „Turniercode“ ein und landen in derselben Lobby.
				</p>
			) : null}
			{error ? (
				<p role="alert" className="m-0 mt-2 text-xs text-[var(--danger)]">
					{error}
				</p>
			) : null}
		</section>
	);
}
