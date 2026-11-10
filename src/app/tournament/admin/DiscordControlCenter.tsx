"use client";

import { LoadingOrb } from "@/components/LoadingIndicator";

import { useEffect, useEffectEvent, useState, useTransition, type ReactNode } from "react";
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
	const [previewSending, setPreviewSending] = useState(false);

	async function sendPreview() {
		setPreviewSending(true);
		setError("");
		const response = await fetch("/api/tournament/discord-preview", { method: "POST" }).catch(() => null);
		const json = (await response?.json().catch(() => null)) as { message?: string; team?: string } | null;
		if (response?.ok) setMessage(`Vorschau mit ${json?.team ?? "Beispielteam"} als DM an dich gesendet.`);
		else setError(json?.message ?? "Vorschau konnte nicht gesendet werden.");
		setPreviewSending(false);
	}

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

	const welcomeRefresh = () => {
		setMessage("");
		setError("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/roster/publish", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ refreshWelcomePosts: true }),
			});
			const json = (await response.json().catch(() => null)) as { discordJobId?: string | null; message?: string } | null;
			if (!response.ok) setError(json?.message ?? "Begrüßungen konnten nicht aktualisiert werden.");
			else setMessage(json?.discordJobId ? "Die Begrüßungen in den Teamchannels werden aktualisiert." : "Keine Teamchannels zum Aktualisieren gefunden.");
			await loadJobs();
		});
	};

	return (
		<div className="grid gap-6 text-[var(--text)]">
			<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
				<span>
					<strong className="tabular-nums">{status?.counts.rosterPlayers ?? "–"}</strong> <span className="text-[var(--muted)]">Spieler im Roster</span>
				</span>
				<span>
					<strong className="tabular-nums">{status?.counts.tournamentAccess ?? "–"}</strong> <span className="text-[var(--muted)]">mit Turnierrolle</span>
				</span>
				{status ? (
					<span className="flex flex-wrap gap-1.5 text-xs">
						<ConfigBadge ok={status.configured.tournamentRole} label="Turnierrolle" />
						<ConfigBadge ok={status.configured.captainRole} label="Captainrolle" />
						<ConfigBadge
							ok={status.configured.teamRoles === status.configured.teams && status.configured.teams > 0}
							label={`${status.configured.teamRoles}/${status.configured.teams} Teamrollen`}
						/>
					</span>
				) : null}
				<button
					type="button"
					disabled={previewSending}
					onClick={sendPreview}
					title="Schickt dir die Teamchannel-Begrüßung und beide Roster-DMs als Vorschau. Niemand sonst wird angeschrieben oder gepingt."
					className={`ml-auto text-[var(--text)] ${BUTTON}`}
				>
					{previewSending ? "Sende Vorschau…" : "Vorschau an mich"}
				</button>
			</div>

			{message ? (
				<p role="status" className="m-0 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-xs font-medium text-[var(--accent)]">
					{message}
				</p>
			) : null}
			{error ? (
				<p role="alert" className="m-0 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
					{error}
				</p>
			) : null}

			<Group title="Abgleichen">
				<ActionRow
					title="Rollen prüfen"
					text="Turnier-, Team- und Captainrollen gegen das Roster. Ändert nur, was fehlt oder falsch ist."
					count={status?.counts.sync}
					action={
						<button type="button" disabled={isPending} onClick={() => run("sync")} className={`text-[var(--text)] ${BUTTON}`}>
							Prüfen
						</button>
					}
				/>
				<ActionRow
					title="Alle Rollen reparieren"
					text="Prüft jeden Spieler einzeln. Nach Bot-Ausfällen oder Handänderungen in Discord."
					count={status?.counts.repair}
					action={
						<button type="button" disabled={isPending} onClick={() => run("repair")} className={`text-[var(--text)] ${BUTTON}`}>
							Reparieren
						</button>
					}
				/>
				<ActionRow title="Nicknames" text="Format „Anzeigename | Riot-ID“ für alle Roster-Spieler." action={<NicknameSyncButton />} />
				<ActionRow
					title="Team-Begrüßungen"
					text="Bearbeitet die Begrüßung in jedem Teamchannel (Captain, Teamtag, Termine). Postet nichts Neues, pingt niemanden."
					action={
						<button type="button" disabled={isPending} onClick={welcomeRefresh} className={`text-[var(--text)] ${BUTTON}`}>
							Aktualisieren
						</button>
					}
				/>
			</Group>

			<Group title="Nach dem Turnier" tone="danger">
				<ActionRow
					title="Turnierphase beenden"
					text="Entfernt Team- und Captainrollen. Die Turnierrolle für Feedback bleibt."
					count={status?.counts.endPhase}
					action={
						<button type="button" disabled={isPending} onClick={() => setEndConfirm(true)} className={`text-[var(--amber)] ${BUTTON}`}>
							Beenden
						</button>
					}
				/>
				<ActionRow
					title="Turnierzugang entfernen"
					text={`Entfernt die Turnierrolle von allen. Empfohlen ab ${cleanupLabel}.`}
					count={status?.counts.removeAccess}
					action={
						<button type="button" disabled={isPending} onClick={() => setAccessConfirm(true)} className={`text-[var(--danger)] ${BUTTON}`}>
							Entfernen
						</button>
					}
				/>
			</Group>

			<Group title="Letzte Discord-Jobs">
				{jobs.length === 0 ? (
					<p className="m-0 px-4 py-3 text-xs text-[var(--muted)]">Noch keine Discord-Jobs.</p>
				) : (
					<div className="themed-scrollbar max-h-72 overflow-y-auto">
						{jobs.map((job) => (
							<JobRow key={job.id} job={job} busy={isPending} onRetry={() => retry(job.id)} />
						))}
					</div>
				)}
			</Group>

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
		</div>
	);
}

const BUTTON = "rounded-lg border border-[var(--line)] bg-[var(--admin-step)] px-3 py-1.5 text-xs font-semibold transition hover:border-[var(--line-strong)] disabled:opacity-45";

function Group({ title, tone, children }: { title: string; tone?: "danger"; children: ReactNode }) {
	return (
		<section aria-label={title}>
			<h3 className={`mb-2 text-xs font-semibold ${tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{title}</h3>
			<div
				className={`divide-y divide-[var(--line)] overflow-hidden rounded-xl border bg-[var(--admin-inset)] ${
					tone === "danger" ? "border-[color-mix(in_srgb,var(--danger)_30%,var(--line))]" : "border-[var(--line)]"
				}`}
			>
				{children}
			</div>
		</section>
	);
}

function ConfigBadge({ ok, label }: { ok: boolean; label: string }) {
	return (
		<span className="tally rounded-full border border-[var(--line)] px-2.5 py-0.5" data-tone={ok ? "ok" : "warn"}>
			{label}
		</span>
	);
}

function ActionRow({ title, text, count, action }: { title: string; text: string; count?: number; action: ReactNode }) {
	return (
		<div className="grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
			<div className="min-w-0">
				<div className="flex items-center gap-2 text-sm font-medium">
					{title}
					{count !== undefined ? (
						<span className="rounded-md bg-[var(--admin-step)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--muted)]" title="Betroffene Aktionen">
							{count}
						</span>
					) : null}
				</div>
				<p className="m-0 mt-0.5 text-xs leading-5 text-[var(--muted)]">{text}</p>
			</div>
			<div className="sm:justify-self-end">{action}</div>
		</div>
	);
}

const JOB_STATUS: Record<Job["status"], string> = { queued: "Wartet", running: "Läuft", completed: "Fertig", failed: "Fehler" };

function JobRow({ job, busy, onRetry }: { job: Job; busy: boolean; onRetry: () => void }) {
	const running = job.status === "queued" || job.status === "running";
	const progress = job.total ? Math.round((job.completed / job.total) * 100) : running ? 0 : 100;
	return (
		<div className="grid gap-1.5 border-b border-[var(--line)] px-4 py-2.5 last:border-b-0">
			<div className="flex items-center justify-between gap-3">
				<span className="min-w-0 truncate text-xs font-medium">{job.title}</span>
				<span className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
					{running ? <LoadingOrb state="searching" /> : null}
					<span className="tabular-nums">
						{job.completed}/{job.total}
					</span>
					<span className={job.status === "failed" ? "text-[var(--danger)]" : job.status === "completed" ? "text-[var(--accent)]" : ""}>
						{JOB_STATUS[job.status]}
						{job.failed ? ` · ${job.failed}` : ""}
					</span>
				</span>
			</div>
			<div className="h-1 overflow-hidden rounded-full bg-[var(--admin-step)]">
				<div
					className={`h-full rounded-full ${job.status === "failed" ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
					style={{ width: `${progress}%` }}
				/>
			</div>
			{job.current && running ? <div className="truncate text-xs text-[var(--muted)]">{job.current}</div> : null}
			{job.status === "failed" ? (
				<button type="button" disabled={busy} onClick={onRetry} className={`justify-self-start text-[var(--danger)] ${BUTTON}`}>
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
		<div role="dialog" aria-modal="true" aria-labelledby="remove-access-title" className="fixed inset-0 z-[1050] grid place-items-center px-5">
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
