"use client";

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
		? new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(new Date(status.cleanupRecommendedAt))
		: "Kein Turnierende hinterlegt";

	return (
		<section className="overflow-hidden rounded-[2rem] border border-cyan-200/14 bg-[#08150f]/88 shadow-xl shadow-black/22">
			<header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 bg-gradient-to-r from-cyan-300/[0.065] via-transparent to-amber-200/[0.035] p-5">
				<div>
					<div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100/56">Discord Control Center</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Rollen, Nicknames und Queue</h2>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/52">
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
					<div className="rounded-2xl border border-amber-200/14 bg-amber-200/[0.045] p-4">
						<div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-100/54">Nickname-Prüfung</div>
						<p className="mt-2 text-xs leading-5 text-emerald-100/48">
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
						<div className="flex flex-wrap gap-2 text-[10px] font-bold">
							<ConfigBadge ok={status.configured.tournamentRole} label="Turnierrolle" />
							<ConfigBadge ok={status.configured.captainRole} label="Captainrolle" />
							<ConfigBadge
								ok={status.configured.teamRoles === status.configured.teams && status.configured.teams > 0}
								label={`${status.configured.teamRoles}/${status.configured.teams} Teamrollen`}
							/>
						</div>
					) : null}
					{message ? <div className="rounded-xl border border-lime-200/20 bg-lime-200/8 px-3 py-2 text-xs font-bold text-lime-50">{message}</div> : null}
					{error ? <div className="rounded-xl border border-red-300/24 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">{error}</div> : null}
				</div>

				<div className="min-w-0 rounded-2xl border border-white/8 bg-black/18 p-4">
					<div className="flex items-center justify-between">
						<div>
							<div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100/42">Queue-Historie</div>
							<div className="mt-1 text-sm font-black text-emerald-50">Letzte Discord-Jobs</div>
						</div>
						<span className="size-2 rounded-full bg-cyan-200 shadow-lg shadow-cyan-300/40" />
					</div>
					<div className="themed-scrollbar mt-3 grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
						{jobs.length === 0 ? (
							<div className="rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs text-emerald-100/40">Noch keine Discord-Jobs vorhanden.</div>
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
		<div className="rounded-xl border border-white/9 bg-black/20 px-3 py-2">
			<div className="text-base font-black text-emerald-50">{value}</div>
			<div className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-100/38">{label}</div>
		</div>
	);
}

function ConfigBadge({ ok, label }: { ok: boolean; label: string }) {
	return (
		<span className={`rounded-full border px-2.5 py-1 ${ok ? "border-lime-200/20 bg-lime-200/8 text-lime-100" : "border-amber-200/20 bg-amber-200/8 text-amber-100"}`}>
			{ok ? "✓" : "!"} {label}
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
	const styles = {
		cyan: "border-cyan-200/16 bg-cyan-300/[0.05] text-cyan-50",
		lime: "border-lime-200/16 bg-lime-200/[0.05] text-lime-50",
		amber: "border-amber-200/18 bg-amber-200/[0.055] text-amber-50",
		red: "border-red-300/20 bg-red-500/[0.06] text-red-100",
	};
	return (
		<div className={`flex min-h-44 flex-col rounded-2xl border p-4 ${styles[tone]}`}>
			<div className="flex items-start justify-between gap-3">
				<h3 className="font-black">{title}</h3>
				<span className="rounded-lg border border-current/15 bg-black/18 px-2 py-1 font-mono text-xs font-black">{count ?? "–"}</span>
			</div>
			<p className="mt-2 flex-1 text-xs leading-5 opacity-55">{text}</p>
			<button
				type="button"
				disabled={disabled}
				onClick={onClick}
				className="mt-4 rounded-xl border border-current/24 bg-black/16 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition hover:bg-white/[0.07] disabled:opacity-45"
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
			className={`rounded-xl border p-3 ${job.status === "failed" ? "border-red-300/20 bg-red-500/[0.07]" : job.status === "completed" ? "border-lime-200/14 bg-lime-200/[0.045]" : "border-cyan-200/16 bg-cyan-300/[0.055]"}`}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-xs font-black text-emerald-50">{job.title}</div>
					<div className="mt-1 text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-100/42">
						{job.status} · {job.completed}/{job.total}
						{job.failed ? ` · ${job.failed} Fehler` : ""}
					</div>
				</div>
				{running ? <span className="size-3 animate-spin rounded-full border-2 border-cyan-100/25 border-t-cyan-100" /> : null}
			</div>
			{job.current ? <div className="mt-2 truncate text-[10px] text-emerald-100/42">{job.current}</div> : null}
			{job.status === "failed" ? (
				<button
					type="button"
					disabled={busy}
					onClick={onRetry}
					className="mt-2 rounded-lg border border-red-200/20 bg-red-200/[0.06] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-red-100 disabled:opacity-45"
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
		<div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center px-5">
			<button type="button" aria-label="Schließen" onClick={onCancel} className="absolute inset-0 bg-black/72 backdrop-blur-sm" />
			<div className="relative w-full max-w-lg rounded-[2rem] border border-red-300/24 bg-[#0b1710] p-6 shadow-2xl shadow-black/60">
				<div className="text-[10px] font-black uppercase tracking-[0.22em] text-red-200/64">Destruktive Discord-Aktion</div>
				<h2 className="mt-2 text-2xl font-black text-emerald-50">Turnierzugang entfernen</h2>
				<p className="mt-3 text-sm leading-6 text-emerald-100/58">
					Die Turnierrolle wird von {count} Mitgliedern entfernt. Feedback- und Ergebnis-Channels können danach nicht mehr sichtbar sein.
				</p>
				<label className="mt-5 grid gap-2">
					<span className="text-[10px] font-black uppercase tracking-[0.16em] text-red-100/68">Zum Bestätigen eingeben: TURNIERZUGANG ENTFERNEN</span>
					<input
						value={value}
						onChange={(event) => onChange(event.target.value)}
						className="rounded-xl border border-red-300/20 bg-black/28 px-3 py-3 text-sm font-black text-emerald-50 outline-none focus:border-red-300/45"
					/>
				</label>
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onCancel} className="rounded-xl border border-white/12 px-4 py-2 text-xs font-black text-emerald-100">
						Abbrechen
					</button>
					<button
						type="button"
						disabled={busy || value !== "TURNIERZUGANG ENTFERNEN"}
						onClick={onConfirm}
						className="rounded-xl bg-red-200 px-4 py-2 text-xs font-black text-red-950 disabled:opacity-35"
					>
						Rolle entfernen
					</button>
				</div>
			</div>
		</div>
	);
}
