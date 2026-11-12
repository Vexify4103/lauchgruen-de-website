"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import type { TournamentApplication } from "@/lib/tournament-storage";
import { playingAccountApprovalSchema, type ApprovedPlayingAccount } from "@/lib/tournament-playing-account";

type AccountState = { tournamentId: string; tournamentName: string; approval: ApprovedPlayingAccount | null; version: number };

export function PlayingAccountEditor({ app }: { app: TournamentApplication }) {
	const id = useId();
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [state, setState] = useState<AccountState | null>(null);
	const [riotId, setRiotId] = useState("");
	const [reason, setReason] = useState("");
	const [confirmed, setConfirmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [dialog, setDialog] = useState<"approve" | "reset" | null>(null);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		const controller = new AbortController();
		void fetch(`/api/tournament/playing-account?applicationId=${encodeURIComponent(app.id)}`, { signal: controller.signal, cache: "no-store" })
			.then(async (response) => {
				if (!response.ok) throw new Error("Freigabe konnte nicht geladen werden.");
				return response.json() as Promise<AccountState>;
			})
			.then((next) => {
				if (controller.signal.aborted) return;
				setState(next);
				setRiotId(next.approval?.riotId ?? "");
				setReason(next.approval?.reason ?? "");
			})
			.catch(() => {
				if (!controller.signal.aborted) setMessage("Freigabe konnte nicht geladen werden. Bitte erneut versuchen.");
			});
		return () => controller.abort();
	}, [app.id, reload]);

	async function save() {
		if (!state || busy || !dialog) return;
		const reset = dialog === "reset";
		setDialog(null);
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch("/api/tournament/playing-account", {
				method: reset ? "DELETE" : "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					applicationId: app.id,
					tournamentId: state.tournamentId,
					expectedVersion: state.version,
					...(!reset ? { riotId: riotId.trim(), reason: reason.trim(), confirmed } : {}),
				}),
			});
			const json = await response.json().catch(() => null);
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return;
			}
			if (typeof json?.version === "number") setState((previous) => (previous ? { ...previous, version: json.version } : previous));
			if (!response.ok) {
				setMessage(json?.message ?? "Freigabe konnte nicht gespeichert werden.");
				return;
			}
			setState({ ...state, approval: json.approval, version: json.version });
			setConfirmed(false);
			if (reset) {
				setRiotId("");
				setReason("");
			}
			setMessage(json.message);
			router.refresh();
		} catch {
			setMessage("Netzwerkfehler. Bitte den aktuellen Stand erneut laden, bevor du es noch einmal versuchst.");
		} finally {
			setBusy(false);
		}
	}

	const canApprove =
		state &&
		playingAccountApprovalSchema.safeParse({ applicationId: app.id, tournamentId: state.tournamentId, expectedVersion: state.version, riotId, reason, confirmed }).success;
	const inputClass =
		"w-full rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] disabled:opacity-50";
	return (
		<section aria-labelledby={`${id}-title`} className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-4">
			<header className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 id={`${id}-title`} className="text-sm font-semibold text-[var(--text)]">
						Turnier-Spielaccount
					</h3>
					<p className="mt-1 text-xs text-[var(--muted)]">{state?.tournamentName ?? "Freigabe wird geladen…"} · Nur dieses Turnier</p>
				</div>
				{state?.approval ? (
					<span className="tally" data-tone="ok">
						Von der Orga freigegeben
					</span>
				) : null}
			</header>
			<dl className="grid gap-1 text-xs text-[var(--muted)]">
				<div>
					<dt className="inline">Verknüpfter Account: </dt>
					<dd className="inline font-medium text-[var(--text)]">{app.riotId}</dd>
				</div>
				<div>
					<dt className="inline">Scouting / OP.GG: </dt>
					<dd className="inline font-medium text-[var(--text)]">{app.scoutRiotId || app.riotId}</dd>
				</div>
				<div>
					<dt className="inline">Aktiv im Turnier: </dt>
					<dd className="inline font-medium text-[var(--accent)]">{state?.approval?.riotId ?? app.riotId}</dd>
				</div>
			</dl>
			{state?.approval ? (
				<p className="text-xs leading-5 text-[var(--muted)]">
					Freigegeben am {new Date(state.approval.approvedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}. Begründung: {state.approval.reason}
				</p>
			) : null}
			<p className="text-xs leading-5 text-[var(--muted)]">
				Die Orga bestätigt die Nutzung ohne Icon-Verifizierung. Angezeigt und in neuen Replays geprüft wird der Spielaccount. Main-Verknüpfung, Scouting, Balancing-Rang und
				Team bleiben unverändert. Keine automatische Freigabe für spätere Turniere.
			</p>
			<label htmlFor={`${id}-riot`} className="grid gap-1 text-xs font-medium text-[var(--muted)]">
				Neuer Spielaccount <span className="sr-only">(Pflichtfeld)</span>
				<input
					id={`${id}-riot`}
					value={riotId}
					onChange={(event) => {
						setRiotId(event.target.value);
						setConfirmed(false);
					}}
					placeholder="Name#Tag"
					spellCheck={false}
					autoComplete="off"
					maxLength={22}
					disabled={busy || !state}
					className={inputClass}
				/>
			</label>
			<label htmlFor={`${id}-reason`} className="grid gap-1 text-xs font-medium text-[var(--muted)]">
				Begründung der Ausnahme (mindestens 5 Zeichen)
				<textarea
					id={`${id}-reason`}
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					rows={2}
					maxLength={500}
					disabled={busy || !state}
					className={inputClass}
				/>
			</label>
			<label className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
				<input
					type="checkbox"
					checked={confirmed}
					onChange={(event) => setConfirmed(event.target.checked)}
					disabled={busy || !state}
					className="mt-1 accent-[var(--accent)]"
				/>
				Ich bestätige die Nutzung dieses Accounts für dieses Turnier. Dies ist eine Orga-Freigabe, kein Nachweis der Account-Inhaberschaft.
			</label>
			<div className="flex flex-wrap gap-2">
				<button type="button" disabled={!canApprove || busy} onClick={() => setDialog("approve")} className="button primary small disabled:opacity-45">
					{busy ? "Wird gespeichert…" : "Spielaccount freigeben"}
				</button>
				{state?.approval ? (
					<button type="button" disabled={busy} onClick={() => setDialog("reset")} className="button ghost small">
						Zurück zum verknüpften Account
					</button>
				) : null}
				<button
					type="button"
					disabled={busy}
					onClick={() => {
						setMessage("");
						setReload((n) => n + 1);
					}}
					className="button ghost small"
				>
					Stand neu laden
				</button>
			</div>
			<p className="text-xs text-[var(--muted)]">Die Freigabe wird separat gespeichert, nicht über „Speichern“ der Bewerbung.</p>
			{message ? (
				<p role="status" className="text-xs leading-5 text-[var(--muted)]">
					{message}
				</p>
			) : null}
			<ConfirmDialog
				open={dialog !== null}
				title={dialog === "reset" ? "Freigabe zurücksetzen?" : "Spielaccount freigeben?"}
				description={`${app.displayName} spielt dann unter ${dialog === "reset" ? app.riotId : riotId.trim()}. Die Änderung gilt sofort für die veröffentlichten Turnierseiten und neue Replay-Prüfungen. Bereits gespeicherte Replay-Auswertungen bleiben unverändert. Es werden keine Team-DMs oder Discord-Rollenänderungen ausgelöst.`}
				confirmLabel={dialog === "reset" ? "Freigabe zurücksetzen" : "Für dieses Turnier freigeben"}
				onCancel={() => setDialog(null)}
				onConfirm={() => void save()}
			/>
		</section>
	);
}
