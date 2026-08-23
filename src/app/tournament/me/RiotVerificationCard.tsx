"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
		setStatus({ kind: "loading", message: "Riot-Account wird gesucht..." });
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
				message: attempt === 1 ? "Profilicon wird geprüft..." : `Riot synchronisiert noch · Versuch ${attempt}/${maxAttempts}`,
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
		setStatus({ kind: "loading", message: "Riot-Verknüpfung wird entfernt..." });
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
			<section className="rounded-[2rem] border border-lime-200/18 bg-lime-200/[0.055] p-5 shadow-xl shadow-black/20">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Riot-Account</div>
						<h2 className="mt-2 text-2xl font-black text-emerald-50">{verified.riotId}</h2>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/60">
							Dein League-Account ist verifiziert und kann für Turniere sowie freigegebene Community-Overlays verwendet werden.
						</p>
					</div>
					<span className="rounded-full border border-lime-200/20 bg-lime-200/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-lime-100">
						Verifiziert
					</span>
				</div>
				<div className="mt-5 grid gap-3 sm:grid-cols-3">
					<AccountInfo label="Rang" value={verified.currentRankAuto ?? "Unranked"} />
					<AccountInfo label="Beschwörerlevel" value={verified.summonerLevel ? String(verified.summonerLevel) : "Nicht gespeichert"} />
					<AccountInfo label="Verifiziert am" value={formatDate(verified.verifiedAt)} />
				</div>
				<button
					type="button"
					onClick={() => setDisconnectConfirmOpen(true)}
					disabled={Boolean(disconnectBlockedReason)}
					className="mt-4 rounded-2xl border border-red-200/18 bg-red-500/8 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-red-100/72 transition hover:border-red-200/30 hover:bg-red-500/12 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Riot-Account trennen
				</button>
				{disconnectBlockedReason ? (
					<div className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/[0.07] px-4 py-3 text-xs font-bold leading-5 text-amber-50/78">
						{disconnectBlockedReason}
					</div>
				) : null}
				{status.kind === "loading" ? <StatusMessage message={status.message} /> : null}
				{status.kind === "error" ? <ErrorMessage message={status.message} /> : null}
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
			</section>
		);
	}

	return (
		<section className="rounded-[2rem] border border-amber-200/20 bg-amber-200/[0.055] p-5 shadow-xl shadow-black/20">
			<div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/68">Riot-Verifizierung</div>
			<h2 className="mt-2 text-2xl font-black text-emerald-50">Riot-ID einmalig bestätigen.</h2>
			<p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/60">
				Diese Verknüpfung gilt auch ohne Turnierbewerbung und wird für spätere Overlays wiederverwendet. Als Besitznachweis wechselst du kurz dein League-Profilicon.
			</p>

			{!challenge ? (
				<form onSubmit={start} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
					<input
						value={riotId}
						onChange={(event) => setRiotId(event.target.value)}
						required
						placeholder="Name#TAG"
						className="h-12 rounded-2xl border border-white/10 bg-black/24 px-4 text-sm font-bold text-emerald-50 outline-none placeholder:text-emerald-100/30 focus:border-amber-200/40"
					/>
					<button
						type="submit"
						disabled={status.kind === "loading"}
						className="rounded-2xl bg-amber-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950 disabled:opacity-55"
					>
						{status.kind === "loading" ? "Wird gesucht..." : "Verifizierung starten"}
					</button>
				</form>
			) : (
				<div className="mt-5 rounded-2xl border border-amber-100/12 bg-black/16 p-4">
					<div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
						<IconState label="Benötigtes Icon" iconUrl={challenge.expectedIconUrl} iconId={challenge.expectedIconId} tone="expected" />
						<div className="text-xs leading-6 text-emerald-100/64">
							<div className="text-sm font-black text-emerald-50">{challenge.riotId}</div>
							Setze dieses Icon im League-Client und lass es aktiv, bis die Prüfung erfolgreich war. Ein Logout ist nicht nötig.
						</div>
						<button
							type="button"
							onClick={() => void verify()}
							disabled={status.kind === "loading"}
							className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-55"
						>
							{status.kind === "loading" ? "Prüfe..." : "Jetzt prüfen"}
						</button>
					</div>
					{challenge.checkedAt && challenge.currentIconUrl ? (
						<div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/8 pt-4">
							<IconState label="Von Riot gemeldet" iconUrl={challenge.currentIconUrl} iconId={challenge.currentIconId} tone="current" />
							<div className="text-xs leading-5 text-emerald-100/52">
								Letzte direkte Riot-Abfrage: <strong className="text-emerald-50">{formatTime(challenge.checkedAt)}</strong>
								<br />
								Wenn hier noch dein altes Icon erscheint, hat Riot die Änderung serverseitig noch nicht übernommen.
							</div>
						</div>
					) : null}
				</div>
			)}

			{status.kind === "loading" ? <StatusMessage message={status.message} /> : null}
			{status.kind === "error" ? <ErrorMessage message={status.message} /> : null}
		</section>
	);
}

function IconState({ label, iconUrl, iconId, tone }: { label: string; iconUrl: string; iconId: number; tone: "expected" | "current" }) {
	return (
		<div className="flex items-center gap-3">
			<Image
				src={iconUrl}
				alt={`League-Profilicon ${iconId}`}
				width={80}
				height={80}
				unoptimized
				className={`size-20 rounded-2xl border ${tone === "expected" ? "border-amber-200/30" : "border-cyan-200/30"}`}
			/>
			<div>
				<div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-100/42">{label}</div>
				<div className="mt-1 text-xs font-black text-emerald-50">Icon {iconId}</div>
			</div>
		</div>
	);
}

function AccountInfo({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-white/8 bg-black/16 px-4 py-3">
			<div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-100/42">{label}</div>
			<div className="mt-1 text-sm font-black text-emerald-50">{value}</div>
		</div>
	);
}

function StatusMessage({ message }: { message: string }) {
	return (
		<div className="mt-3 flex items-center gap-3 rounded-xl border border-cyan-200/18 bg-cyan-300/[0.07] px-4 py-3 text-xs font-bold text-cyan-50">
			<span className="size-4 animate-spin rounded-full border-2 border-cyan-100/25 border-t-cyan-100" />
			{message}
		</div>
	);
}

function ErrorMessage({ message }: { message: string }) {
	return <div className="mt-3 rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-xs text-red-100">{message}</div>;
}

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Unbekannt" : date.toLocaleDateString("de-DE");
}

function formatTime(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "gerade eben" : date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
