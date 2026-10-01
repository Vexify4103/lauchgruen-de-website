"use client";

import { LoadingOrb } from "@/components/LoadingIndicator";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RiotGamesMark } from "@/components/BrandMarks";

type VerifiedAccount = {
	riotId: string;
	currentRankAuto: string | null;
	summonerLevel?: number;
	verifiedAt: string;
};

type Challenge = {
	riotId: string;
	expectedIconId: number;
	expectedIconUrl: string;
	currentIconId: number;
	currentIconUrl?: string;
	expiresAt: string;
	checkedAt?: string;
	revisionDate?: number;
};

type Status = { kind: "idle"; message: "" } | { kind: "loading"; message: string } | { kind: "error"; message: string };

export function RiotVerificationCard({ verified, disconnectBlockedReason }: { verified: VerifiedAccount | null; disconnectBlockedReason?: string | null }) {
	const router = useRouter();
	const [riotId, setRiotId] = useState("");
	const [challenge, setChallenge] = useState<Challenge | null>(null);
	const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
	const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

	async function start(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!riotId.trim()) return;
		setStatus({ kind: "loading", message: "Riot-Account wird gesucht…" });
		const response = await fetch("/api/riot/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ riotId: riotId.trim() }),
		});
		const result = (await response.json().catch(() => null)) as (Challenge & { message?: string }) | { message?: string } | null;
		if (!response.ok || !result || !("expectedIconId" in result)) {
			setStatus({ kind: "error", message: result?.message ?? "Verifizierung konnte nicht gestartet werden." });
			return;
		}
		setChallenge(result);
		setStatus({ kind: "idle", message: "" });
	}

	async function verify() {
		if (!challenge) return;
		if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
			setChallenge(null);
			setStatus({ kind: "error", message: "Die Verifizierung ist abgelaufen. Starte bitte eine neue Challenge." });
			return;
		}

		const maxAttempts = 5;
		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			setStatus({
				kind: "loading",
				message: attempt === 1 ? "Profilicon wird geprüft…" : `Riot synchronisiert noch · Versuch ${attempt}/${maxAttempts}`,
			});
			const response = await fetch("/api/riot/verify", { method: "POST", cache: "no-store" });
			const result = (await response.json().catch(() => null)) as {
				verified?: unknown;
				message?: string;
				currentIconId?: number;
				currentIconUrl?: string;
				checkedAt?: string;
				revisionDate?: number;
			} | null;

			if (response.ok && result?.verified) {
				setStatus({ kind: "idle", message: "" });
				setChallenge(null);
				router.refresh();
				return;
			}
			if (response.status === 404 || response.status === 410) {
				setChallenge(null);
				setStatus({ kind: "error", message: result?.message ?? "Die Verifizierung ist nicht mehr aktiv." });
				return;
			}
			if (response.status === 409) {
				setChallenge((current) =>
					current
						? {
								...current,
								currentIconId: result?.currentIconId ?? current.currentIconId,
								currentIconUrl: result?.currentIconUrl ?? current.currentIconUrl,
								checkedAt: result?.checkedAt ?? new Date().toISOString(),
								revisionDate: result?.revisionDate,
							}
						: current
				);
			}
			if (response.status !== 409 || attempt === maxAttempts) {
				setStatus({
					kind: "error",
					message: result?.message ?? "Das neue Icon ist bei Riot noch nicht sichtbar. Lass es eingestellt und prüfe gleich erneut.",
				});
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 2500));
		}
	}

	async function disconnect() {
		setDisconnectConfirmOpen(false);
		setStatus({ kind: "loading", message: "Riot-Verknüpfung wird entfernt…" });
		const response = await fetch("/api/riot/disconnect", { method: "POST" });
		const result = (await response.json().catch(() => null)) as { message?: string } | null;
		if (!response.ok) {
			setStatus({ kind: "error", message: result?.message ?? "Riot-Verknüpfung konnte nicht entfernt werden." });
			return;
		}
		setStatus({ kind: "idle", message: "" });
		router.refresh();
	}

	if (verified) {
		return (
			<article className="connection-card connected riot">
				<span>
					<RiotGamesMark />
				</span>
				<div>
					<small>League-Identität</small>
					<h3>Riot Games</h3>
					<p>{verified.riotId}</p>
				</div>
				<button type="button" className="connection-action danger" onClick={() => setDisconnectConfirmOpen(true)} disabled={Boolean(disconnectBlockedReason)}>
					Trennen
				</button>
				<div className="connection-body">
					<dl className="connection-facts">
						<div>
							<dt>Rang</dt>
							<dd>{verified.currentRankAuto ?? "Unranked"}</dd>
						</div>
						<div>
							<dt>Level</dt>
							<dd>{verified.summonerLevel ? String(verified.summonerLevel) : "–"}</dd>
						</div>
						<div>
							<dt>Verifiziert</dt>
							<dd>{formatDate(verified.verifiedAt)}</dd>
						</div>
					</dl>
					{disconnectBlockedReason ? (
						<p className="account-message" data-tone="warn">
							{disconnectBlockedReason}
						</p>
					) : null}
					{status.kind === "loading" ? <StatusMessage message={status.message} /> : null}
					{status.kind === "error" ? <ErrorMessage message={status.message} /> : null}
				</div>
				<ConfirmDialog
					open={disconnectConfirmOpen}
					title="Riot-Account wirklich trennen?"
					description={
						<>
							Die Riot-Verifizierung, deine gespeicherte Turnierbewerbung und deine Wunschgruppe werden entfernt. Twitch bleibt verbunden, wird aber nicht mehr in
							Community-Overlays freigegeben. Du kannst den Riot-Account später erneut verifizieren.
						</>
					}
					confirmLabel="Riot trennen"
					cancelLabel="Abbrechen"
					tone="danger"
					onCancel={() => setDisconnectConfirmOpen(false)}
					onConfirm={() => void disconnect()}
				/>
			</article>
		);
	}

	return (
		<article className="connection-card riot">
			<span>
				<RiotGamesMark />
			</span>
			<div>
				<small>League-Identität</small>
				<h3>Riot Games</h3>
				<p>Nicht verknüpft</p>
			</div>
			<b className="connection-badge" data-tone="warn">
				Offen
			</b>
			<div className="connection-body">
				{!challenge ? (
					<>
						<p>Bestätige deine Riot-ID einmalig über ein League-Profilicon. Die Verknüpfung gilt für alle Turniere und Community-Overlays.</p>
						<form onSubmit={start} className="connection-form">
							<input
								name="riot-id"
								aria-label="Riot-ID"
								autoComplete="off"
								spellCheck={false}
								value={riotId}
								onChange={(event) => setRiotId(event.target.value)}
								required
								placeholder="Name#TAG…"
								className="account-input"
							/>
							<button type="submit" disabled={status.kind === "loading"} className="connection-action solid">
								{status.kind === "loading" ? "Wird gesucht…" : "Prüf-Icon anzeigen"}
							</button>
						</form>
					</>
				) : (
					<>
						<div className="riot-challenge">
							<Image src={challenge.expectedIconUrl} alt={`League-Profilicon ${challenge.expectedIconId}`} width={84} height={84} unoptimized />
							<div>
								<strong>Setze dieses Profilicon für {challenge.riotId}</strong>
								<p>
									Ändere im League-Client dein Profilbild zu Icon {challenge.expectedIconId} und lass es aktiv, bis die Prüfung erfolgreich war. Ein Logout ist
									nicht nötig.
								</p>
							</div>
							<button type="button" onClick={() => void verify()} disabled={status.kind === "loading"} className="connection-action solid">
								{status.kind === "loading" ? "Prüfe…" : "Icon prüfen"}
							</button>
						</div>
						{challenge.checkedAt && challenge.currentIconUrl ? (
							<div className="riot-challenge">
								<Image src={challenge.currentIconUrl} alt={`League-Profilicon ${challenge.currentIconId}`} width={84} height={84} unoptimized data-tone="current" />
								<div>
									<strong>Von Riot gemeldet: Icon {challenge.currentIconId}</strong>
									<p>
										Letzte Abfrage um {formatTime(challenge.checkedAt)}. Steht hier noch dein altes Icon, hat Riot die Änderung serverseitig noch nicht
										übernommen.
									</p>
								</div>
							</div>
						) : null}
					</>
				)}
				{status.kind === "loading" ? <StatusMessage message={status.message} /> : null}
				{status.kind === "error" ? <ErrorMessage message={status.message} /> : null}
			</div>
		</article>
	);
}

function StatusMessage({ message }: { message: string }) {
	return (
		<p role="status" className="account-message flex items-center gap-3">
			<LoadingOrb state="searching" />
			{message}
		</p>
	);
}

function ErrorMessage({ message }: { message: string }) {
	return (
		<p role="alert" className="account-message" data-tone="error">
			{message}
		</p>
	);
}

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Unbekannt" : date.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

function formatTime(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "gerade eben" : date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" });
}
