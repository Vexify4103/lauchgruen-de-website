"use client";

import { LoadingOrb } from "@/components/LoadingIndicator";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NicknameSyncButton } from "./NicknameSyncButton";

type ControlStatus = {
	configured: { tournamentRole: boolean; captainRole: boolean; teamRoles: number; teams: number };
	counts: { rosterPlayers: number; tournamentAccess: number; sync: number; repair: number; endPhase: number; removeAccess: number };
	cleanupRecommendedAt: string | null;
};

type Job = {
	id: string;
	title: string;
	status: "queued" | "running" | "completed" | "failed";
	total: number;
	completed: number;
	failed: number;
	current?: string;
	warnings: string[];
	createdAt: string;
};

type Action = "sync" | "repair" | "end-phase" | "remove-access";

export function DiscordControlCenter() {
	const [status, setStatus] = useState<ControlStatus | null>(null);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [endConfirm, setEndConfirm] = useState(false);
	const [accessConfirm, setAccessConfirm] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const [isPending, startTransition] = useTransition();

	async function loadControl() {
		const controlResponse = await fetch("/api/tournament/discord-control");
		const controlJson = (await controlResponse.json().catch(() => null)) as ControlStatus & { message?: string };
		if (controlResponse.ok) {
			setStatus(controlJson);
			setError("");
		} else {
			setError(controlJson?.message ?? "Discord-Status konnte nicht geladen werden.");
		}
	}

	async function loadJobs() {
		const jobsResponse = await fetch("/api/tournament/discord-jobs");
		const jobsJson = (await jobsResponse.json().catch(() => null)) as { jobs?: Job[]; message?: string } | null;
		if (jobsResponse.ok && jobsJson?.jobs) setJobs(jobsJson.jobs);
	}
	const refreshAll = useEffectEvent(() => void Promise.all([loadControl(), loadJobs()]));
	const refreshJobs = useEffectEvent(() => void loadJobs());
	const hasActiveJob = jobs.some((job) => job.status === "queued" || job.status === "running");

	useEffect(() => {
		const initialTimer = window.setTimeout(refreshAll, 0);
		const handleFocus = () => refreshAll();
		window.addEventListener("focus", handleFocus);
		return () => {
			window.clearTimeout(initialTimer);
			window.removeEventListener("focus", handleFocus);
		};
	}, []);

	useEffect(() => {
		if (!hasActiveJob) return;
		const timer = window.setInterval(() => {
			if (document.visibilityState === "visible") refreshJobs();
		}, 2000);
		return () => window.clearInterval(timer);
	}, [hasActiveJob]);

	function run(action: Action, typedConfirmation?: string) {
		setMessage("");
		setError("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/discord-control", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action, confirmation: typedConfirmation }),
			});
			const json = (await response.json().catch(() => null)) as { queued?: number; job?: Job | null; message?: string } | null;
			if (!response.ok) {
				setError(json?.message ?? "Discord-Aktion fehlgeschlagen.");
				return;
			}
			setMessage(json?.job ? `${json.job.title}: ${json.queued ?? 0} Aktion(en) wurden eingereiht.` : "Discord ist bereits im gewünschten Zustand.");
			setEndConfirm(false);
			setAccessConfirm(false);
			setConfirmation("");
			await Promise.all([loadControl(), loadJobs()]);
		});
	}

	function retry(jobId: string) {
		startTransition(async () => {
			const response = await fetch("/api/tournament/discord-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }) });
			const json = (await response.json().catch(() => null)) as { job?: Job; message?: string } | null;
			if (!response.ok) setError(json?.message ?? "Fehler konnten nicht wiederholt werden.");
			else setMessage(`${json?.job?.total ?? 0} fehlgeschlagene Aktion(en) erneut eingereiht.`);
			await loadJobs();
		});
	}

	const cleanupLabel = status?.cleanupRecommendedAt
		? new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(status.cleanupRecommendedAt))
		: "Kein Turnierende hinterlegt";

	return (
		<section className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[#08150f]/88">
			<header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] p-5">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">Discord Control Center</div>
					<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Rollen, Nicknames und Queue</h2>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
						Alle Massenänderungen laufen nacheinander durch eine persistente, rate-limit-schonende Queue.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-2 text-center">
					<StatusPill label="Roster" value={status?.counts.rosterPlayers ?? "–"} />
					<StatusPill label="Turnierzugang" value={status?.counts.tournamentAccess ?? "–"} />
				</div>
			</header>

			<div className="grid gap-5 p-5 xl:grid-cols-[1.1fr_0.9fr]">
				<div className="grid content-start gap-4">
					<div className="grid gap-3 md:grid-cols-2">
						<ActionCard
							title="Team- & Captainrollen prüfen"
							text="Prüft Turnierrolle, jede Teamrolle und die Captainrolle gegen das gespeicherte Roster. Nur fehlende oder veraltete Rollen werden geändert."
							count={status?.counts.sync}
							button="Rollen prüfen & synchronisieren"
							disabled={isPending}
							onClick={() => run("sync")}
							tone="cyan"
						/>
						<ActionCard
							title="Vollständige Rollenreparatur"
							text="Prüft jeden aktuellen Spieler noch einmal einzeln. Sinnvoll nach Bot-Ausfällen, manuellen Discord-Änderungen oder Rollenfehlern."
							count={status?.counts.repair}
							button="Alle Rollen reparieren"
							disabled={isPending}
							onClick={() => run("repair")}
							tone="lime"
						/>
					</div>
					<div className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
						<div className="text-xs font-semibold text-[var(--muted)]">Nickname-Prüfung</div>
						<p className="mt-2 text-xs leading-5 text-[var(--muted)]">
							Vergleicht alle Roster-Spieler mit dem Format „Anzeigename | Riot-ID“ und repariert ausschließlich Abweichungen.
						</p>
						<div className="mt-3">
							<NicknameSyncButton />
						</div>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<ActionCard
							title="Aktive Turnierphase beenden"
							text="Entfernt Team- und Captainrollen. Die Turnierrolle für Feedback bleibt erhalten."
							count={status?.counts.endPhase}
							button="Turnierphase beenden"
							disabled={isPending}
							onClick={() => setEndConfirm(true)}
							tone="amber"
						/>
						<ActionCard
							title="Turnierzugang entfernen"
							text={`Entfernt die persistente Turnierrolle von allen. Empfohlen ab: ${cleanupLabel}.`}
							count={status?.counts.removeAccess}
							button="Turnierzugang entfernen"
							disabled={isPending}
							onClick={() => setAccessConfirm(true)}
							tone="red"
						/>
					</div>
					{status ? (
						<div className="flex flex-wrap gap-2 text-xs font-medium">
							<ConfigBadge ok={status.configured.tournamentRole} label="Turnierrolle" />
							<ConfigBadge ok={status.configured.captainRole} label="Captainrolle" />
							<ConfigBadge
								ok={status.configured.teamRoles === status.configured.teams && status.configured.teams > 0}
								label={`${status.configured.teamRoles}/${status.configured.teams} Teamrollen`}
							/>
						</div>
					) : null}
					{message ? (
						<div role="status" className="rounded-xl border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-xs font-medium text-[var(--accent)]">
							{message}
						</div>
					) : null}
					{error ? (
						<div role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
							{error}
						</div>
					) : null}
				</div>

				<div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
					<div className="flex items-center justify-between">
						<div>
							<div className="text-xs font-semibold text-[var(--muted)]">Queue-Historie</div>
							<div className="mt-1 text-sm font-semibold text-[var(--text)]">Letzte Discord-Jobs</div>
						</div>
						<span className="size-2 rounded-full bg-[var(--muted)]" />
					</div>
					<div className="themed-scrollbar mt-3 grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
						{jobs.length === 0 ? (
							<div className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-3 text-xs text-[var(--muted)]">Noch keine Discord-Jobs vorhanden.</div>
						) : (
							jobs.map((job) => <JobRow key={job.id} job={job} busy={isPending} onRetry={() => retry(job.id)} />)
						)}
					</div>
				</div>
			</div>

			<ConfirmDialog
				open={endConfirm}
				title="Aktive Turnierphase beenden?"
				description={`${status?.counts.endPhase ?? 0} Team- und Captainrollen werden entfernt. Die Turnierrolle bleibt für Feedback erhalten.`}
				confirmLabel="Turnierphase beenden"
				cancelLabel="Abbrechen"
				onCancel={() => setEndConfirm(false)}
				onConfirm={() => run("end-phase")}
			/>
			{accessConfirm ? (
				<TypedConfirmation
					value={confirmation}
					count={status?.counts.removeAccess ?? 0}
					onChange={setConfirmation}
					onCancel={() => {
						setAccessConfirm(false);
						setConfirmation("");
					}}
					onConfirm={() => run("remove-access", confirmation)}
					busy={isPending}
				/>
			) : null}
		</section>
	);
}

function StatusPill({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2">
			<div className="text-base font-semibold text-[var(--text)]">{value}</div>
			<div className="text-xs font-semibold text-[var(--muted)]">{label}</div>
		</div>
	);
}

function ConfigBadge({ ok, label }: { ok: boolean; label: string }) {
	return (
		<span className="tally rounded-full border border-[var(--line)] px-2.5 py-1" data-tone={ok ? "ok" : "warn"}>
			{label}
		</span>
	);
}

function ActionCard({
	title,
	text,
	count,
	button,
	disabled,
	onClick,
	tone,
}: {
	title: string;
	text: string;
	count?: number;
	button: string;
	disabled: boolean;
	onClick: () => void;
	tone: "cyan" | "lime" | "amber" | "red";
}) {
	const buttonTone = {
		cyan: "text-[var(--text)]",
		lime: "text-[var(--accent)]",
		amber: "text-[var(--amber)]",
		red: "text-[var(--danger)]",
	};
	return (
		<div className="flex min-h-44 flex-col rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4 text-[var(--text)]">
			<div className="flex items-start justify-between gap-3">
				<h3 className="font-semibold">{title}</h3>
				<span className="rounded-lg border border-[var(--line)] px-2 py-1 font-mono text-xs font-semibold text-[var(--muted)]">{count ?? "–"}</span>
			</div>
			<p className="mt-2 flex-1 text-xs leading-5 text-[var(--muted)]">{text}</p>
			<button
				type="button"
				disabled={disabled}
				onClick={onClick}
				className={`mt-4 rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-3 py-2 text-xs font-semibold transition hover:border-[var(--line-strong)] disabled:opacity-45 ${buttonTone[tone]}`}
			>
				{button}
			</button>
		</div>
	);
}

function JobRow({ job, busy, onRetry }: { job: Job; busy: boolean; onRetry: () => void }) {
	const running = job.status === "queued" || job.status === "running";
	return (
		<div
			className={`rounded-xl border p-3 ${job.status === "failed" ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]" : job.status === "completed" ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-[var(--line)] bg-[var(--admin-step)]"}`}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-xs font-semibold text-[var(--text)]">{job.title}</div>
					<div className="mt-1 text-xs font-medium text-[var(--muted)]">
						{job.status} · {job.completed}/{job.total}
						{job.failed ? ` · ${job.failed} Fehler` : ""}
					</div>
				</div>
				{running ? <LoadingOrb state="searching" /> : null}
			</div>
			{job.current ? <div className="mt-2 truncate text-xs text-[var(--muted)]">{job.current}</div> : null}
			{job.status === "failed" ? (
				<button
					type="button"
					disabled={busy}
					onClick={onRetry}
					className="mt-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--danger)] disabled:opacity-45"
				>
					Nur Fehler wiederholen
				</button>
			) : null}
		</div>
	);
}

function TypedConfirmation({
	value,
	count,
	onChange,
	onCancel,
	onConfirm,
	busy,
}: {
	value: string;
	count: number;
	onChange: (value: string) => void;
	onCancel: () => void;
	onConfirm: () => void;
	busy: boolean;
}) {
	return (
		<div role="dialog" aria-modal="true" aria-labelledby="remove-access-title" className="fixed inset-0 z-[90] grid place-items-center px-5">
			<button type="button" aria-label="Schließen" onClick={onCancel} className="absolute inset-0 bg-[var(--admin-inset)]" />
			<div className="relative w-full max-w-lg rounded-[16px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--admin-surface)] p-6">
				<div className="text-xs font-semibold text-[var(--danger)]">Destruktive Discord-Aktion</div>
				<h2 id="remove-access-title" className="mt-2 text-2xl font-semibold text-[var(--text)]">
					Turnierzugang entfernen
				</h2>
				<p className="mt-3 text-sm leading-6 text-[var(--muted)]">
					Die Turnierrolle wird von {count} Mitgliedern entfernt. Feedback- und Ergebnis-Channels können danach nicht mehr sichtbar sein.
				</p>
				<label className="mt-5 grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Zum Bestätigen eingeben: TURNIERZUGANG ENTFERNEN</span>
					<input
						name="confirmation"
						autoComplete="off"
						spellCheck={false}
						value={value}
						onChange={(event) => onChange(event.target.value)}
						className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--admin-inset)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
					/>
				</label>
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onCancel} className="rounded-xl border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--text)]">
						Abbrechen
					</button>
					<button
						type="button"
						disabled={busy || value !== "TURNIERZUGANG ENTFERNEN"}
						onClick={onConfirm}
						className="rounded-xl bg-[var(--danger)] px-4 py-2 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-35"
					>
						Rolle entfernen
					</button>
				</div>
			</div>
		</div>
	);
}
