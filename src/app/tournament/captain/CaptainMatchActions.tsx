"use client";

import { useState, useTransition } from "react";
import { ThemedSelect } from "@/components/ThemedSelect";

export function CaptainMatchActions({ matchId, teamName }: { matchId: string; teamName: string }) {
	const [checkedIn, setCheckedIn] = useState(false);
	const [reportOpen, setReportOpen] = useState(false);
	const [message, setMessage] = useState("");
	const [declaredWinner, setDeclaredWinner] = useState("yes");
	const [pending, startTransition] = useTransition();

	function checkIn() {
		startTransition(async () => {
			const response = await fetch("/api/tournament/next", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "check-in", matchId, rosterConfirmed: true, rulesConfirmed: true }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) return setMessage(json?.message ?? "Check-in konnte nicht gespeichert werden.");
			setCheckedIn(true);
			setMessage("Check-in gespeichert. Team und Regeln sind bestätigt.");
		});
	}

	function submitReport(formData: FormData) {
		startTransition(async () => {
			const response = await fetch("/api/tournament/next", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "report",
					matchId,
					declaredWinner: formData.get("winner") === "yes",
					gameDuration: String(formData.get("duration") ?? ""),
					screenshotUrl: String(formData.get("screenshot") ?? ""),
					note: String(formData.get("note") ?? ""),
				}),
			});
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) return setMessage(json?.message ?? "Match-Report konnte nicht gespeichert werden.");
			setReportOpen(false);
			setMessage("Match-Report gesendet. Die Orga kann ihn jetzt prüfen.");
		});
	}

	return (
		<div className="mt-6 border-t border-[var(--line)] pt-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h3 className="text-base font-semibold text-[var(--text)]">Vor und nach dem Match</h3>
				{/* The check-in state is not loaded from the server, so only a fresh check-in is shown. */}
				{checkedIn ? (
					<span className="tally" data-tone="ok">
						Eingecheckt
					</span>
				) : null}
			</div>
			<div className="mt-3 flex flex-wrap gap-3">
				<button
					type="button"
					onClick={checkIn}
					disabled={pending || checkedIn}
					className="rounded-[10px] border border-[var(--line-strong)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--accent)] disabled:cursor-default disabled:opacity-50"
				>
					{checkedIn ? "Team ist bereit" : "Team bereit bestätigen"}
				</button>
				<button
					type="button"
					onClick={() => setReportOpen((open) => !open)}
					disabled={pending}
					aria-expanded={reportOpen}
					className="rounded-[10px] border border-[var(--line)] px-4 py-2.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
				>
					Ergebnis ohne Replay melden
				</button>
			</div>
			{reportOpen ? (
				<form action={submitReport} className="mt-4 grid gap-3 sm:grid-cols-2">
					<label className="grid gap-1 text-sm text-[var(--muted)]">
						Hat {teamName} gewonnen?
						<ThemedSelect
							name="winner"
							value={declaredWinner}
							onChange={setDeclaredWinner}
							ariaLabel={`Hat ${teamName} gewonnen?`}
							options={[
								{ value: "yes", label: "Ja" },
								{ value: "no", label: "Nein" },
							]}
						/>
					</label>
					<label className="grid gap-1 text-sm text-[var(--muted)]">
						Spielzeit
						<input name="duration" autoComplete="off" inputMode="numeric" placeholder="31:42" className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none" />
					</label>
					<label className="grid gap-1 text-sm text-[var(--muted)] sm:col-span-2">
						Screenshot-Link (optional)
						<input name="screenshot" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://imgur.com/…" className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none" />
					</label>
					<label className="grid gap-1 text-sm text-[var(--muted)] sm:col-span-2">
						Hinweis für die Orga (optional)
						<textarea name="note" rows={2} autoComplete="off" className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none" />
					</label>
					<div className="sm:col-span-2">
						<button disabled={pending} className="rounded-[10px] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)] disabled:opacity-60">
							Report senden
						</button>
					</div>
				</form>
			) : null}
			{message ? (
				<p role="status" className="mt-3 text-sm text-[var(--text)]">
					{message}
				</p>
			) : null}
		</div>
	);
}
