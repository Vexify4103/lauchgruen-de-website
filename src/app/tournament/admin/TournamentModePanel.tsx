"use client";

import { useState, useTransition } from "react";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { formatTournamentApplicationDeadlineLabel } from "@/lib/tournament-application-deadline";
import type { TournamentSettings } from "@/lib/tournament-settings";

type SettingKey = keyof Pick<TournamentSettings, "applicationsOpen" | "applicationDeadlineOverride" | "tournamentLive" | "draftEnabled">;

function toDateTimeLocalValue(isoDate: string): string {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) return "";

	const offsetMs = date.getTimezoneOffset() * 60_000;
	return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string | null {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	return date.toISOString();
}

export function TournamentModePanel({ initialSettings, initialVersion }: { initialSettings: TournamentSettings; initialVersion: number }) {
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [settings, setSettings] = useState(initialSettings);
	const [deadlineInput, setDeadlineInput] = useState(() => toDateTimeLocalValue(initialSettings.applicationDeadline));
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();

	function persistSettings(
		patch: Partial<Pick<TournamentSettings, "applicationsOpen" | "applicationDeadlineOverride" | "applicationDeadline" | "tournamentLive" | "draftEnabled">>,
		rollbackSettings = settings
	) {
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/settings", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ...patch, expectedVersion: version }),
			});
			const json = (await response.json().catch(() => null)) as { settings?: TournamentSettings; message?: string; version?: number } | null;
			if (!response.ok || !json?.settings) {
				setSettings(rollbackSettings);
				setDeadlineInput(toDateTimeLocalValue(rollbackSettings.applicationDeadline));
				if (isAdminVersionConflict(response, json)) {
					showConflict(json);
					return;
				}
				setMessage(json?.message ?? "Settings konnten nicht gespeichert werden.");
				return;
			}
			if (json.version !== undefined) setVersion(json.version);
			setSettings(json.settings);
			setDeadlineInput(toDateTimeLocalValue(json.settings.applicationDeadline));
			setMessage("Settings gespeichert.");
		});
	}

	function toggle(key: SettingKey) {
		const previousSettings = settings;
		const nextValue = !settings[key];
		const patch =
			key === "applicationDeadlineOverride" && nextValue
				? ({ applicationDeadlineOverride: true, applicationsOpen: true } satisfies Parameters<typeof persistSettings>[0])
				: ({ [key]: nextValue } satisfies Parameters<typeof persistSettings>[0]);
		setSettings((current) => ({ ...current, ...patch }));
		persistSettings(patch, previousSettings);
	}

	function saveDeadline() {
		const nextDeadline = fromDateTimeLocalValue(deadlineInput);
		if (!nextDeadline) {
			setMessage("Bitte eine gültige Bewerbungsfrist auswählen.");
			return;
		}
		const previousSettings = settings;
		setSettings((current) => ({ ...current, applicationDeadline: nextDeadline, applicationDeadlineOverride: false }));
		persistSettings({ applicationDeadline: nextDeadline, applicationDeadlineOverride: false }, previousSettings);
	}

	return (
		<section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/24">
			<div className="border-b border-white/8 bg-gradient-to-r from-lime-200/[0.08] via-white/[0.025] to-cyan-200/[0.05] p-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Tournament Mode</div>
						<h2 className="mt-2 text-2xl font-black text-emerald-50">Live-Schalter</h2>
					</div>
					<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-emerald-100/54">
						{new Date(settings.updatedAt).toLocaleTimeString("de-DE")}
					</div>
				</div>
			</div>

			<div className="grid gap-4 p-5">
				<div className={`rounded-[1.75rem] border p-5 ${settings.applicationsOpen ? "border-lime-200/24 bg-lime-200/[0.09]" : "border-white/10 bg-black/18"}`}>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="min-w-0">
							<div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/52">Bewerbungen</div>
							<div className={`mt-2 text-4xl font-black tracking-tight ${settings.applicationsOpen ? "text-lime-50" : "text-emerald-100/42"}`}>
								{settings.applicationsOpen ? "Offen" : "Geschlossen"}
							</div>
							<p className="mt-2 max-w-md text-sm leading-6 text-emerald-100/58">
								Master-Schalter für das Bewerbungsformular. Die Frist entscheidet automatisch, ob Bewerbungen gerade sichtbar sind.
							</p>
						</div>
						<TogglePill active={settings.applicationsOpen} disabled={isPending} onClick={() => toggle("applicationsOpen")} label="Bewerbungen umschalten" />
					</div>
				</div>

				<div className="rounded-[1.75rem] border border-white/10 bg-black/18 p-5">
					<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
						<label className="min-w-0">
							<span className="block text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/48">Bewerbungsfrist</span>
							<input
								type="datetime-local"
								value={deadlineInput}
								onChange={(event) => setDeadlineInput(event.target.value)}
								className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07110c] px-4 text-sm font-black text-emerald-50 outline-none transition focus:border-lime-200/40"
							/>
						</label>
						<button
							type="button"
							disabled={isPending}
							onClick={saveDeadline}
							className="h-12 rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-6 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
						>
							Frist speichern
						</button>
					</div>
					<p className="mt-3 text-xs leading-5 text-emerald-100/52">
						Aktuell: <span className="font-black text-emerald-50/80">{formatTournamentApplicationDeadlineLabel(settings.applicationDeadline)}</span>. Liegt die Frist in der
						Zukunft und Bewerbungen sind offen, ist <span className="font-black text-lime-100">/apply</span> automatisch verfügbar.
					</p>
				</div>

				<div className="grid gap-3">
					<CompactSetting
						label="Deadline-Override"
						value={settings.applicationDeadlineOverride ? "Aktiv" : "Aus"}
						detail="Nur für Notfälle: ignoriert den Bewerbungsschluss."
						active={settings.applicationDeadlineOverride}
						disabled={isPending}
						onClick={() => toggle("applicationDeadlineOverride")}
					/>
					<CompactSetting
						label="Turniermodus"
						value={settings.tournamentLive ? "Live" : "Vorbereitung"}
						detail="Markiert das Turnier öffentlich als live."
						active={settings.tournamentLive}
						disabled={isPending}
						onClick={() => toggle("tournamentLive")}
					/>
					<CompactSetting
						label="Champ Select"
						value={settings.draftEnabled ? "Aktiv" : "Pausiert"}
						detail="Steuert, ob Captains den Website-Draft öffnen können."
						active={settings.draftEnabled}
						disabled={isPending}
						onClick={() => toggle("draftEnabled")}
					/>
				</div>

				{settings.applicationsOpen && settings.applicationDeadlineOverride ? (
					<div className="rounded-2xl border border-amber-200/22 bg-amber-200/10 px-4 py-3 text-sm font-bold leading-6 text-amber-50">
						Notfall-Bewerbungen sind offen: Der normale Bewerbungsschluss wird gerade bewusst ignoriert.
					</div>
				) : null}
				{message ? <div className="rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">{message}</div> : null}
			</div>
		</section>
	);
}

function CompactSetting({
	label,
	value,
	detail,
	active,
	disabled,
	onClick,
}: {
	label: string;
	value: string;
	detail: string;
	active: boolean;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<div className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 ${active ? "border-lime-200/22 bg-lime-200/[0.07]" : "border-white/10 bg-black/18"}`}>
			<div className="min-w-0">
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/48">{label}</div>
					<div className={`text-sm font-black ${active ? "text-lime-50" : "text-emerald-100/50"}`}>{value}</div>
				</div>
				<p className="mt-1 text-xs leading-5 text-emerald-100/50">{detail}</p>
			</div>
			<TogglePill active={active} disabled={disabled} onClick={onClick} label={`${label} umschalten`} />
		</div>
	);
}

function TogglePill({ active, disabled, onClick, label }: { active: boolean; disabled: boolean; onClick: () => void; label: string }) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			className={`h-8 w-14 shrink-0 rounded-full border p-1 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-55 ${
				active ? "border-lime-200/42 bg-lime-200/22" : "border-white/10 bg-black/30"
			}`}
		>
			<span className={`block size-5 rounded-full transition ${active ? "translate-x-6 bg-lime-100 shadow-lg shadow-lime-200/30" : "bg-emerald-100/32"}`} />
		</button>
	);
}
