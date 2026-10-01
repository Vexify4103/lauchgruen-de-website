"use client";

import { useState, useTransition, type ReactNode } from "react";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { formatTournamentApplicationDeadlineLabel, formatTournamentApplicationOpenLabel } from "@/lib/tournament-application-deadline";
import type { TournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_MODES, type TournamentMode } from "@/lib/tournament-mode";
import { ThemedDateTimePicker } from "@/components/ThemedDateTimePicker";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ThemedNumberInput } from "@/components/ThemedNumberInput";
import { TournamentMarkdown } from "@/components/TournamentMarkdown";
import { TOURNAMENT_KIND_LABELS, usesChampSelect, usesFearless, usesUltimateBravery } from "@/lib/tournament-kind";
import {
	BEST_OF_VALUES,
	DAY_ONE_FORMATS,
	DAY_ONE_FORMAT_DETAILS,
	DAY_ONE_FORMAT_LABELS,
	PLAYOFF_FORMATS,
	PLAYOFF_FORMAT_DETAILS,
	PLAYOFF_FORMAT_LABELS,
	SIDE_SELECTION_LABELS,
	SIDE_SELECTION_RULES,
	TIEBREAKERS,
	TIEBREAKER_LABELS,
	deriveStructure,
	describeStructurePlan,
	describeTiebreakers,
	mainEventTeamCount,
	reviewStructure,
	winsNeeded,
	type BestOf,
	type DayOneFormat,
	type PlayoffFormat,
	type SideSelectionRule,
	type Tiebreaker,
} from "@/lib/tournament-structure";

type SettingKey = keyof Pick<TournamentSettings, "applicationsOpen" | "applicationDeadlineOverride" | "tournamentLive" | "draftEnabled">;
type SettingsPatch = Partial<
	Pick<TournamentSettings, "applicationsOpen" | "applicationOpenAt" | "applicationDeadlineOverride" | "applicationDeadline" | "tournamentLive" | "draftEnabled">
> & {
	tournamentMode?: TournamentMode;
	fearless?: TournamentSettings["fearless"];
	ultimateBravery?: TournamentSettings["ultimateBravery"];
};

const modeLabels: Record<TournamentMode, { label: string; detail: string }> = {
	teaser: { label: "Ankündigung", detail: "Nur Übersicht und Konto sind sichtbar. Turnierdaten bleiben verborgen." },
	registration: { label: "Anmeldung", detail: "Das Turnier sammelt Bewerbungen; Format und Teams können noch offen sein." },
	preparation: { label: "Vorbereitung", detail: "Orga richtet Teams, Format und Ablauf ein." },
	live: { label: "Live", detail: "Das Turnier läuft öffentlich." },
	paused: { label: "Pausiert", detail: "Öffentliche Turnierabläufe sind vorübergehend angehalten." },
	finished: { label: "Abgeschlossen", detail: "Zeigt den Champion und alle finalen Ergebnisse, ohne das Turnier bereits zu archivieren." },
};

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

function toNullableDateTimeLocalValue(isoDate: string | null): string {
	return isoDate ? toDateTimeLocalValue(isoDate) : "";
}

export type TournamentSettingsSection = "format" | "rules" | "applications" | "lifecycle";

export function TournamentModePanel({
	initialSettings,
	initialVersion,
	section,
	onSaved,
}: {
	initialSettings: TournamentSettings;
	initialVersion: number;
	/** Render only one group of settings, e.g. inside an admin modal. */
	section?: TournamentSettingsSection;
	onSaved?: () => void;
}) {
	const show = (key: TournamentSettingsSection) => !section || section === key;
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [settings, setSettings] = useState(initialSettings);
	const [openAtInput, setOpenAtInput] = useState(() => toNullableDateTimeLocalValue(initialSettings.applicationOpenAt));
	const [deadlineInput, setDeadlineInput] = useState(() => toDateTimeLocalValue(initialSettings.applicationDeadline));
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const structure = settings.ultimateBravery;
	const participants = mainEventTeamCount(structure);
	const review = reviewStructure(structure);
	const plan = { lines: describeStructurePlan(structure) };

	function updateStructure(patch: Partial<TournamentSettings["ultimateBravery"]>) {
		setSettings((current) => ({ ...current, ultimateBravery: deriveStructure({ ...current.ultimateBravery, ...patch }) }));
	}

	function updateTiebreaker(index: number, value: Tiebreaker | null) {
		const next = [...structure.tiebreakers];
		if (value === null) next.splice(index);
		else next[index] = value;
		updateStructure({ tiebreakers: next.filter(Boolean) });
	}

	function persistSettings(patch: SettingsPatch, rollbackSettings = settings) {
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
				setOpenAtInput(toNullableDateTimeLocalValue(rollbackSettings.applicationOpenAt));
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
			setOpenAtInput(toNullableDateTimeLocalValue(json.settings.applicationOpenAt));
			setDeadlineInput(toDateTimeLocalValue(json.settings.applicationDeadline));
			setMessage("Settings gespeichert.");
			onSaved?.();
		});
	}

	function saveTournamentMode(mode: TournamentMode) {
		if (mode === "finished" && !window.confirm("Turnier abschließen? Matchzugriff und Live-Betrieb werden deaktiviert, alle Ergebnisse bleiben erhalten.")) return;
		const previousSettings = settings;
		const safetyPatch: SettingsPatch =
			mode === "registration"
				? { tournamentMode: mode, tournamentLive: false, draftEnabled: false, applicationsOpen: true }
				: mode === "live"
					? { tournamentMode: mode, tournamentLive: true, draftEnabled: true, applicationsOpen: false }
					: { tournamentMode: mode, tournamentLive: false, draftEnabled: false, applicationsOpen: false };
		setSettings((current) => ({
			...current,
			...safetyPatch,
			activeTournament: { ...current.activeTournament, mode },
		}));
		persistSettings(safetyPatch, previousSettings);
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

	function saveApplicationWindow() {
		const nextOpenAt = openAtInput.trim() ? fromDateTimeLocalValue(openAtInput) : null;
		const nextDeadline = fromDateTimeLocalValue(deadlineInput);
		if (openAtInput.trim() && !nextOpenAt) {
			setMessage("Bitte einen gültigen Bewerbungsstart auswählen.");
			return;
		}
		if (!nextDeadline) {
			setMessage("Bitte eine gültige Bewerbungsfrist auswählen.");
			return;
		}
		const previousSettings = settings;
		setSettings((current) => ({ ...current, applicationOpenAt: nextOpenAt, applicationDeadline: nextDeadline, applicationDeadlineOverride: false }));
		persistSettings({ applicationOpenAt: nextOpenAt, applicationDeadline: nextDeadline, applicationDeadlineOverride: false }, previousSettings);
	}

	function saveFearless(patch: Partial<TournamentSettings["fearless"]>) {
		const previousSettings = settings;
		const fearless = { ...settings.fearless, ...patch };
		setSettings((current) => ({ ...current, fearless }));
		persistSettings({ fearless }, previousSettings);
	}

	function saveUltimateBravery() {
		persistSettings({ ultimateBravery: settings.ultimateBravery });
	}

	return (
		<section className={section ? "" : "overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/24"}>
			<div className={section ? "hidden" : "border-b border-white/8 bg-gradient-to-r from-lime-200/[0.08] via-white/[0.025] to-cyan-200/[0.05] p-5"}>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Tournament Mode</div>
						<h2 className="mt-2 text-2xl font-black text-emerald-50">Live-Schalter</h2>
					</div>
					<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-emerald-100/54">
						{new Date(settings.updatedAt).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin" })}
					</div>
				</div>
			</div>

			<div className={section ? "grid gap-4" : "grid gap-4 p-5"}>
				{show("format") ? (
					<div className="rounded-[1.75rem] border border-amber-200/16 bg-amber-200/[0.045] p-5">
						<div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/64">
							{settings.activeTournament.name} · {TOURNAMENT_KIND_LABELS[settings.activeTournament.kind]}
						</div>

						<FormatGroup title="Termine & Teilnehmer">
							<label className="text-xs font-bold text-emerald-100/62">
								Tag 1
								<ThemedDateTimePicker
									ariaLabel="Startzeit von Tag 1"
									value={structure.startAt ? toDateTimeLocalValue(structure.startAt) : ""}
									onChange={(value) => updateStructure({ startAt: fromDateTimeLocalValue(value) })}
									clearable
								/>
							</label>
							<label className="text-xs font-bold text-emerald-100/62">
								Tag 2
								<ThemedDateTimePicker
									ariaLabel="Startzeit von Tag 2"
									value={structure.dayTwoStartAt ? toDateTimeLocalValue(structure.dayTwoStartAt) : ""}
									onChange={(value) => updateStructure({ dayTwoStartAt: fromDateTimeLocalValue(value) })}
									clearable
								/>
							</label>
							<label className="text-xs font-bold text-emerald-100/62">
								Gesamtzahl Teams
								<ThemedNumberInput
									min={2}
									max={32}
									value={structure.teamCount}
									ariaLabel="Gesamtzahl Teams"
									onChange={(value) => updateStructure({ teamCount: Math.max(2, Math.min(32, Number(value) || 2)) })}
								/>
							</label>
							<label className="text-xs font-bold text-emerald-100/62">
								Play-in vor Tag 1
								<ThemedSelect
									value={String(structure.playInTeamCount)}
									onChange={(value) => updateStructure({ playInTeamCount: Number(value) })}
									ariaLabel="Play-in vor Tag 1"
									options={[
										{ value: "0", label: "Kein Play-in", description: "Alle Teams starten direkt an Tag 1." },
										...[2, 4, 6, 8, 10, 12].flatMap((count) =>
											count <= structure.teamCount - 2
												? [
														{
															value: String(count),
															label: `${count} Teams spielen vorab`,
															description: `${count / 2} kommen weiter, ${count / 2} scheiden aus.`,
														},
													]
												: []
										),
									]}
								/>
							</label>
						</FormatGroup>

						<FormatGroup title="Tag 1">
							<label className="text-xs font-bold text-emerald-100/62 sm:col-span-2">
								Format an Tag 1
								<ThemedSelect
									value={structure.dayOneFormat}
									onChange={(value) => updateStructure({ dayOneFormat: value as DayOneFormat })}
									ariaLabel="Format an Tag 1"
									options={DAY_ONE_FORMATS.map((format) => ({
										value: format,
										label: DAY_ONE_FORMAT_LABELS[format],
										description: DAY_ONE_FORMAT_DETAILS[format],
									}))}
								/>
							</label>
							{structure.dayOneFormat === "groups" ? (
								<>
									<label className="text-xs font-bold text-emerald-100/62">
										Anzahl Gruppen
										<ThemedNumberInput
											min={1}
											max={Math.min(16, participants)}
											value={structure.groupCount}
											ariaLabel="Anzahl Gruppen"
											onChange={(value) => updateStructure({ groupCount: Number(value) || 1 })}
										/>
									</label>
									<label className="text-xs font-bold text-emerald-100/62">
										Begegnungen pro Paarung
										<ThemedSelect
											value={String(structure.groupRoundRobinLegs)}
											onChange={(value) => updateStructure({ groupRoundRobinLegs: Number(value) as 1 | 2 })}
											ariaLabel="Begegnungen pro Paarung"
											options={[
												{ value: "1", label: "Einmal gegeneinander" },
												{ value: "2", label: "Hin- und Rückrunde" },
											]}
										/>
									</label>
									<label className="text-xs font-bold text-emerald-100/62">
										Teams in den Playoffs
										<ThemedNumberInput
											min={2}
											max={participants}
											value={structure.advanceTeamCount}
											ariaLabel="Teams in den Playoffs"
											onChange={(value) => updateStructure({ advanceTeamCount: Number(value) || 2 })}
										/>
									</label>
								</>
							) : null}
							{structure.dayOneFormat === "swiss" ? (
								<label className="text-xs font-bold text-emerald-100/62">
									Teams in den Playoffs
									<ThemedSelect
										value={structure.advanceTeamCount >= participants ? "all" : "half"}
										onChange={(value) => updateStructure({ advanceTeamCount: value === "all" ? participants : Math.max(2, Math.floor(participants / 2)) })}
										ariaLabel="Teams in den Playoffs"
										options={[
											{ value: "half", label: `50 % · ${Math.max(2, Math.floor(participants / 2))} Teams` },
											{ value: "all", label: `Alle · ${participants} Teams` },
										]}
									/>
								</label>
							) : null}
							{structure.dayOneFormat === "swiss-elimination" ? (
								<label className="text-xs font-bold text-emerald-100/62">
									Weiter / raus bei
									<ThemedSelect
										value={String(structure.swissWinsToAdvance)}
										onChange={(value) => updateStructure({ swissWinsToAdvance: Number(value) as 2 | 3 })}
										ariaLabel="Siege zum Weiterkommen"
										options={[
											{ value: "2", label: "2 Siegen / 2 Niederlagen", description: "Bis zu 3 Runden, ab 4 Teams." },
											{ value: "3", label: "3 Siegen / 3 Niederlagen", description: "Bis zu 5 Runden, ab 16 Teams (Major-Format)." },
										]}
									/>
								</label>
							) : null}
							{structure.dayOneFormat === "swiss" || structure.dayOneFormat === "swiss-elimination" ? (
								<label className="text-xs font-bold text-emerald-100/62">
									Paarungen in Runde 1
									<ThemedSelect
										value={structure.swissRoundOneSeeding}
										onChange={(value) => updateStructure({ swissRoundOneSeeding: value as "random" | "seeded" })}
										ariaLabel="Paarungen in Runde 1"
										options={[
											{ value: "random", label: "Zufällig gelost" },
											{ value: "seeded", label: "Nach Setzliste", description: "#1 gegen den besten Seed der unteren Hälfte; Setzliste im Roster-Builder." },
										]}
									/>
								</label>
							) : null}
						</FormatGroup>

						<FormatGroup title="Tag 2 · Playoffs">
							<label className="text-xs font-bold text-emerald-100/62 sm:col-span-2">
								Playoff-Format
								<ThemedSelect
									value={structure.format}
									onChange={(value) => updateStructure({ format: value as PlayoffFormat })}
									ariaLabel="Playoff-Format"
									options={PLAYOFF_FORMATS.map((format) => ({
										value: format,
										label: PLAYOFF_FORMAT_LABELS[format],
										description: PLAYOFF_FORMAT_DETAILS[format],
									}))}
								/>
							</label>
							{structure.format === "single-elimination" ? (
								<InlineToggle
									label="Spiel um Platz 3"
									detail="Die beiden Verlierer der Halbfinals spielen um Platz 3."
									active={structure.thirdPlaceMatch}
									onClick={() => updateStructure({ thirdPlaceMatch: !structure.thirdPlaceMatch })}
								/>
							) : null}
							{structure.format === "double-elimination" || structure.format === "double-elimination-light" ? (
								<InlineToggle
									label="Bracket Reset im Grand Final"
									detail="Gewinnt das Team aus dem Lower Bracket das Grand Final, folgt ein zweites Finale. Ohne Reset entscheidet ein Finale."
									active={structure.grandFinalReset}
									onClick={() => updateStructure({ grandFinalReset: !structure.grandFinalReset })}
								/>
							) : null}
						</FormatGroup>

						<FormatGroup title="Serienlänge">
							{(
								[
									["dayOne", "Play-in & Tag 1"],
									["playoffs", "Playoffs"],
									["finals", "Finale"],
								] as const
							).map(([key, label]) => (
								<label key={key} className="text-xs font-bold text-emerald-100/62">
									{label}
									<ThemedSelect
										value={String(structure.bestOf[key])}
										onChange={(value) => updateStructure({ bestOf: { ...structure.bestOf, [key]: Number(value) as BestOf } })}
										ariaLabel={`Serienlänge ${label}`}
										options={BEST_OF_VALUES.map((value) => ({
											value: String(value),
											label: `Best of ${value}`,
											description: value === 1 ? "Ein Spiel entscheidet." : `Wer zuerst ${winsNeeded(value)} Spiele gewinnt.`,
										}))}
									/>
								</label>
							))}
						</FormatGroup>

						<FormatGroup title="Tabellen & Seiten">
							{[0, 1, 2].map((index) => (
								<label key={index} className="text-xs font-bold text-emerald-100/62">
									{index + 1}. Tiebreaker
									<ThemedSelect
										value={structure.tiebreakers[index] ?? "none"}
										onChange={(value) => updateTiebreaker(index, value === "none" ? null : (value as Tiebreaker))}
										ariaLabel={`${index + 1}. Tiebreaker`}
										options={[
											...(index > 0 ? [{ value: "none", label: "Kein weiterer" }] : []),
											...TIEBREAKERS.map((entry) => ({
												value: entry,
												label: TIEBREAKER_LABELS[entry],
												disabled: structure.tiebreakers.includes(entry) && structure.tiebreakers[index] !== entry,
											})),
										]}
									/>
								</label>
							))}
							<label className="text-xs font-bold text-emerald-100/62">
								Seitenwahl
								<ThemedSelect
									value={structure.sideSelection}
									onChange={(value) => updateStructure({ sideSelection: value as SideSelectionRule })}
									ariaLabel="Seitenwahl"
									options={SIDE_SELECTION_RULES.map((rule) => ({ value: rule, label: SIDE_SELECTION_LABELS[rule] }))}
								/>
							</label>
							<p className="text-[11px] leading-5 text-emerald-100/46 sm:col-span-2">{describeTiebreakers(structure.tiebreakers)}.</p>
						</FormatGroup>

						<div className="mt-4 rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.055] p-4" role="status">
							<div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/62">Berechneter Ablauf</div>
							<ul className="mt-2 grid gap-1 text-sm font-bold text-emerald-50">
								{plan.lines.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
							{review.errors.map((error) => (
								<div key={error} className="mt-3 rounded-xl border border-red-300/24 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">
									{error}
								</div>
							))}
							{review.warnings.map((warning) => (
								<div key={warning} className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-50">
									{warning}
								</div>
							))}
						</div>
						<button
							type="button"
							disabled={isPending || review.errors.length > 0}
							onClick={saveUltimateBravery}
							className="mt-4 h-12 rounded-2xl bg-gradient-to-r from-amber-200 via-lime-200 to-cyan-200 px-6 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-55"
						>
							{isPending ? "Speichert…" : review.errors.length ? "Erst Fehler beheben" : "Format speichern"}
						</button>
					</div>
				) : null}
				{show("rules") ? (
					<div className="rounded-[1.75rem] border border-amber-200/16 bg-amber-200/[0.045] p-5">
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="text-xs font-bold text-emerald-100/62">
								Mindestlevel
								<ThemedNumberInput
									min={1}
									max={1000}
									value={settings.ultimateBravery.minimumSummonerLevel}
									ariaLabel="Mindestlevel"
									onChange={(value) =>
										setSettings((current) => ({ ...current, ultimateBravery: { ...current.ultimateBravery, minimumSummonerLevel: Number(value) } }))
									}
								/>
							</label>
							{usesUltimateBravery(settings.activeTournament) ? (
								<label className="text-xs font-bold text-emerald-100/62">
									Rerolls pro Spieler
									<ThemedSelect
										value={String(settings.ultimateBravery.rerollsPerPlayer)}
										onChange={(value) =>
											setSettings((current) => ({ ...current, ultimateBravery: { ...current.ultimateBravery, rerollsPerPlayer: Number(value) } }))
										}
										ariaLabel="Rerolls pro Spieler"
										options={[
											{ value: "2", label: "2 Rerolls" },
											{ value: "3", label: "3 Rerolls" },
										]}
									/>
								</label>
							) : null}
							<div className="sm:col-span-2">
								<label htmlFor="tournament-prize-pool" className="text-xs font-bold text-emerald-100/62">
									Preisankündigung
								</label>
								<textarea
									id="tournament-prize-pool"
									name="prize-pool"
									autoComplete="off"
									value={settings.ultimateBravery.prizePool}
									maxLength={4000}
									rows={9}
									onChange={(event) => setSettings((current) => ({ ...current, ultimateBravery: { ...current.ultimateBravery, prizePool: event.target.value } }))}
									placeholder={"# Preispool\n\n- 1. Platz: …\n- 2. Platz: …"}
									className="mt-2 min-h-48 w-full resize-y rounded-2xl border border-white/10 bg-[#07110c] px-4 py-3 font-mono text-sm leading-6 text-emerald-50 outline-none transition focus:border-cyan-200/35 focus:ring-2 focus:ring-cyan-200/10"
								/>
								<div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold leading-5 text-emerald-100/46">
									<span>`#` Überschrift · `##` Untertitel · `-` Liste · `**fett**` · `_kursiv_` · `~~durchgestrichen~~` · `[Link](https://...)`</span>
									<span>{settings.ultimateBravery.prizePool.length}/4000</span>
								</div>
								<div className="mt-4 rounded-2xl border border-amber-200/16 bg-amber-200/[0.055] p-4">
									<div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/56">Öffentliche Vorschau</div>
									<TournamentMarkdown>{settings.ultimateBravery.prizePool || "Noch keine Preisankündigung eingetragen."}</TournamentMarkdown>
								</div>
							</div>
						</div>
						<button
							type="button"
							disabled={isPending}
							onClick={saveUltimateBravery}
							className="mt-4 h-12 rounded-2xl bg-gradient-to-r from-amber-200 via-lime-200 to-cyan-200 px-6 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-55"
						>
							{isPending ? "Speichert…" : "Regeln & Preise speichern"}
						</button>
						{usesFearless(settings.activeTournament) ? (
							<div className="mt-4">
								<CompactSetting
									label="Fearless · Gegner-Champions"
									value={settings.fearless.lockOpponentChampions ? "Auch gesperrt" : "Nur eigene gesperrt"}
									detail={
										settings.fearless.lockOpponentChampions
											? "Ein Team kann weder Champions picken, die es selbst, noch solche, die sein aktueller Gegner im Turnier bereits gespielt hat."
											: "Ein Team kann keine Champions picken, die es im Turnier bereits gespielt hat. Die Picks des Gegners bleiben frei."
									}
									active={settings.fearless.lockOpponentChampions}
									disabled={isPending}
									onClick={() => saveFearless({ lockOpponentChampions: !settings.fearless.lockOpponentChampions })}
								/>
								<label className="mt-3 block text-xs font-bold text-emerald-100/62">
									Fearless-Sperren gelten
									<ThemedSelect
										value={settings.fearless.scope}
										disabled={isPending}
										onChange={(value) => saveFearless({ scope: value === "series" ? "series" : "tournament" })}
										ariaLabel="Geltungsbereich der Fearless-Sperren"
										options={[
											{ value: "tournament", label: "Für das ganze Turnier", description: "Ein gespielter Champion bleibt bis zum Ende gesperrt." },
											{
												value: "series",
												label: "Nur innerhalb einer Serie",
												description: "Die Sperren gelten in einer Bo3/Bo5-Serie und beginnen im nächsten Match neu.",
											},
										]}
									/>
								</label>
							</div>
						) : null}
					</div>
				) : null}
				{show("lifecycle") ? (
					<div className="rounded-[1.75rem] border border-cyan-200/16 bg-cyan-300/[0.045] p-5">
						<label className="block">
							<span className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/64">Sichtbarer Turnierstatus</span>
							<ThemedSelect
								value={settings.activeTournament.mode}
								disabled={isPending}
								onChange={(value) => saveTournamentMode(value as TournamentMode)}
								ariaLabel="Sichtbarer Turnierstatus"
								options={TOURNAMENT_MODES.map((mode) => ({ value: mode, label: modeLabels[mode].label, description: modeLabels[mode].detail }))}
							/>
						</label>
						<p className="mt-3 text-xs leading-5 text-emerald-100/58">{modeLabels[settings.activeTournament.mode].detail}</p>
						{usesChampSelect(settings.activeTournament) ? (
							<div className="mt-4">
								<CompactSetting
									label="Champ Select"
									value={settings.draftEnabled ? "Aktiv" : "Pausiert"}
									detail="Steuert, ob Captains den Website-Draft öffnen können."
									active={settings.draftEnabled}
									disabled={isPending}
									onClick={() => toggle("draftEnabled")}
								/>
							</div>
						) : null}
					</div>
				) : null}
				{show("applications") ? (
					<>
						<div className={`rounded-[1.75rem] border p-5 ${settings.applicationsOpen ? "border-lime-200/24 bg-lime-200/[0.09]" : "border-white/10 bg-black/18"}`}>
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div className="min-w-0">
									<div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/52">Bewerbungen</div>
									<div className={`mt-2 text-4xl font-black tracking-tight ${settings.applicationsOpen ? "text-lime-50" : "text-emerald-100/42"}`}>
										{settings.applicationsOpen ? "Offen" : "Geschlossen"}
									</div>
									<p className="mt-2 max-w-md text-sm leading-6 text-emerald-100/58">
										Master-Schalter für das Bewerbungsformular. Der Zeitraum unten entscheidet zusätzlich, wann Bewerbungen sichtbar sind.
									</p>
								</div>
								<TogglePill active={settings.applicationsOpen} disabled={isPending} onClick={() => toggle("applicationsOpen")} label="Bewerbungen umschalten" />
							</div>
						</div>

						<div className="rounded-[1.75rem] border border-white/10 bg-black/18 p-5">
							<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
								<label className="min-w-0">
									<span className="block text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/48">Bewerbungsstart</span>
									<ThemedDateTimePicker ariaLabel="Bewerbungsstart" value={openAtInput} onChange={setOpenAtInput} clearable />
								</label>
								<label className="min-w-0">
									<span className="block text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/48">Bewerbungsfrist</span>
									<ThemedDateTimePicker ariaLabel="Bewerbungsfrist" value={deadlineInput} onChange={setDeadlineInput} />
								</label>
								<button
									type="button"
									disabled={isPending}
									onClick={saveApplicationWindow}
									className="h-12 rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-6 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
								>
									Zeitraum speichern
								</button>
							</div>
							<p className="mt-3 text-xs leading-5 text-emerald-100/52">
								Start: <span className="font-black text-emerald-50/80">{formatTournamentApplicationOpenLabel(settings.applicationOpenAt)}</span> · Frist:{" "}
								<span className="font-black text-emerald-50/80">{formatTournamentApplicationDeadlineLabel(settings.applicationDeadline)}</span>. Wenn der
								Master-Schalter offen ist, wird <span className="font-black text-lime-100">/apply</span> automatisch nur in diesem Zeitraum verfügbar.
							</p>
						</div>

						<CompactSetting
							label="Deadline-Override"
							value={settings.applicationDeadlineOverride ? "Aktiv" : "Aus"}
							detail="Nur für Notfälle: öffnet /apply trotz Frist und laufendem Turnier."
							active={settings.applicationDeadlineOverride}
							disabled={isPending}
							onClick={() => toggle("applicationDeadlineOverride")}
						/>

						{settings.applicationsOpen && settings.applicationDeadlineOverride ? (
							<div className="rounded-2xl border border-amber-200/22 bg-amber-200/10 px-4 py-3 text-sm font-bold leading-6 text-amber-50">
								Notfall-Bewerbungen sind offen: Der normale Bewerbungsschluss wird gerade bewusst ignoriert.
							</div>
						) : null}
					</>
				) : null}
				{message ? (
					<div role="status" className="rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">
						{message}
					</div>
				) : null}
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
			aria-pressed={active}
			className={`h-8 w-14 shrink-0 rounded-full border p-1 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-55 ${
				active ? "border-lime-200/42 bg-lime-200/22" : "border-white/10 bg-black/30"
			}`}
		>
			<span className={`block size-5 rounded-full transition ${active ? "translate-x-6 bg-lime-100 shadow-lg shadow-lime-200/30" : "bg-emerald-100/32"}`} />
		</button>
	);
}

function FormatGroup({ title, children }: { title: string; children: ReactNode }) {
	return (
		<fieldset className="mt-5 border-t border-white/8 pt-4">
			<legend className="pr-3 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/48">{title}</legend>
			<div className="mt-2 grid gap-3 sm:grid-cols-2">{children}</div>
		</fieldset>
	);
}

function InlineToggle({ label, detail, active, onClick }: { label: string; detail: string; active: boolean; onClick: () => void }) {
	return (
		<div
			className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 sm:col-span-2 ${active ? "border-lime-200/22 bg-lime-200/[0.07]" : "border-white/10 bg-black/18"}`}
		>
			<div className="min-w-0">
				<div className="text-xs font-black text-emerald-50">{label}</div>
				<p className="mt-1 text-[11px] leading-5 text-emerald-100/50">{detail}</p>
			</div>
			<TogglePill active={active} disabled={false} onClick={onClick} label={`${label} umschalten`} />
		</div>
	);
}
