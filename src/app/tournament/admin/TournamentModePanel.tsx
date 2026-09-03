"use client";

import { useState, useTransition } from "react";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { formatTournamentApplicationDeadlineLabel, formatTournamentApplicationOpenLabel } from "@/lib/tournament-application-deadline";
import type { TournamentSettings } from "@/lib/tournament-settings";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { TOURNAMENT_MODES, type TournamentMode } from "@/lib/tournament-mode";
import { ThemedDateTimePicker } from "@/components/ThemedDateTimePicker";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ThemedNumberInput } from "@/components/ThemedNumberInput";
import { TournamentMarkdown } from "@/components/TournamentMarkdown";

type SettingKey = keyof Pick<TournamentSettings, "applicationsOpen" | "applicationDeadlineOverride" | "tournamentLive" | "draftEnabled">;
type SettingsPatch = Partial<
	Pick<TournamentSettings, "applicationsOpen" | "applicationOpenAt" | "applicationDeadlineOverride" | "applicationDeadline" | "tournamentLive" | "draftEnabled">
> & {
	tournamentMode?: TournamentMode;
	ultimateBravery?: TournamentSettings["ultimateBravery"];
};

const modeLabels: Record<TournamentMode, { label: string; detail: string }> = {
	teaser: { label: "Ankündigung", detail: "Nur Übersicht und Konto sind sichtbar. Turnierdaten bleiben verborgen." },
	registration: { label: "Anmeldung", detail: "Das Turnier sammelt Bewerbungen; Format und Teams können noch offen sein." },
	preparation: { label: "Vorbereitung", detail: "Orga richtet Teams, Format und Ablauf ein." },
	live: { label: "Live", detail: "Das Turnier läuft öffentlich." },
	paused: { label: "Pausiert", detail: "Öffentliche Turnierabläufe sind vorübergehend angehalten." },
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

function swissQualification(teamCount: number, allTeamsAdvance: boolean) {
	const advancing = allTeamsAdvance ? teamCount : Math.max(2, Math.floor(teamCount / 2));
	const winsToAdvance = Math.max(2, Math.ceil(Math.log2(teamCount)) - 1);
	const rounds = allTeamsAdvance ? (teamCount === 8 ? 4 : Math.max(2, Math.ceil(Math.log2(teamCount)) + 1)) : winsToAdvance * 2 - 1;
	return { advancing, rounds };
}

function toNullableDateTimeLocalValue(isoDate: string | null): string {
	return isoDate ? toDateTimeLocalValue(isoDate) : "";
}

function describeTournamentPlan(config: TournamentSettings["ultimateBravery"]) {
	const teamCount = Math.max(2, config.teamCount || 2);
	const groupCount = Math.max(1, Math.min(config.groupCount || 1, teamCount));
	const advancing = Math.max(2, Math.min(config.advanceTeamCount || 2, teamCount));
	const eliminated = teamCount - advancing;
	const isPowerOfTwo = advancing > 0 && (advancing & (advancing - 1)) === 0;
	const playoffFormat = playoffFormatLabel(config.format) ?? "Playoff-Format noch offen";
	const lightWarning =
		config.format === "double-elimination-light" && (config.advanceTeamCount !== config.teamCount || ![6, 8].includes(config.advanceTeamCount))
			? "Double Elimination Light benötigt 6 oder 8 Teams, die alle die Playoffs erreichen. Bei 4 Teams bitte normales Double Elimination wählen."
			: config.format === "double-elimination" && ![4, 8].includes(config.advanceTeamCount)
				? "Normales Double Elimination benötigt 4 oder 8 Playoff-Teams. Für 6 Teams bitte Double Elimination Light wählen."
				: null;
	if (config.dayOneFormat === "undecided") {
		return {
			stage: "Format für Tag 1 noch nicht entschieden",
			qualification: "Die Stage bleibt öffentlich geschlossen, bis Gruppenphase oder Swiss Stage gewählt wurde.",
			warning: lightWarning,
		};
	}

	if (config.dayOneFormat === "swiss") {
		if (config.teamCount === 8 && config.advanceTeamCount === 8) {
			return {
				stage: "8-Team Placement Swiss · bis zu 4 Runden",
				qualification: `Alle Teams erreichen die Playoffs. Die Swiss Stage bestimmt Seed #1 bis #8; ${playoffFormat.toLowerCase()}.`,
				warning: lightWarning,
			};
		}
		const matchesPerRound = Math.floor(teamCount / 2);
		return {
			stage: `${config.swissRounds} Swiss-Runden · ungefähr ${matchesPerRound * config.swissRounds} Matches`,
			qualification: `${advancing === teamCount ? "Alle Teams erreichen die Playoffs." : `Platz 1–${advancing} erreicht die Playoffs, ${eliminated} Team${eliminated === 1 ? " scheidet" : "s scheiden"} an Tag 1 aus.`} ${playoffFormat}.`,
			warning:
				lightWarning ??
				(config.swissRounds > (teamCount % 2 === 0 ? teamCount - 1 : teamCount)
					? "Es sind mehr Swiss-Runden konfiguriert, als ohne ein Rematch mathematisch möglich sind."
					: teamCount % 2 !== 0
						? "Bei einer ungeraden Teamzahl erhält pro Runde ein Team ein möglichst fair verteiltes Freilos."
						: !isPowerOfTwo
							? "Das Playoff-Bracket benötigt Freilose, weil die Zahl der Qualifizierten keine Zweierpotenz ist."
							: null),
		};
	}

	const smallGroupSize = Math.floor(teamCount / groupCount);
	const largeGroupCount = teamCount % groupCount;
	const largeGroupSize = largeGroupCount > 0 ? smallGroupSize + 1 : smallGroupSize;
	const sizes = largeGroupCount > 0 ? `${largeGroupCount}× ${largeGroupSize} und ${groupCount - largeGroupCount}× ${smallGroupSize}` : `${groupCount}× ${smallGroupSize}`;
	const matchCount = Array.from({ length: groupCount }, (_, index) => smallGroupSize + (index < largeGroupCount ? 1 : 0)).reduce(
		(total, size) => total + ((size * (size - 1)) / 2) * config.groupRoundRobinLegs,
		0
	);
	return {
		stage: `${groupCount} Gruppe${groupCount === 1 ? "" : "n"} (${sizes}) · ${matchCount} Matches`,
		qualification: `${advancing === teamCount ? "Alle Teams erreichen die Playoffs." : `${advancing} von ${teamCount} Teams erreichen die Playoffs; ${eliminated} scheiden an Tag 1 aus.`} ${playoffFormat}.`,
		warning:
			lightWarning ??
			(teamCount % groupCount !== 0
				? "Die Teams lassen sich nicht gleichmäßig auf die Gruppen verteilen."
				: advancing % groupCount !== 0
					? "Die Playoff-Plätze lassen sich nicht gleichmäßig pro Gruppe vergeben; eine Wildcard-Regel ist nötig."
					: !isPowerOfTwo && config.format !== "double-elimination-light"
						? "Das Playoff-Bracket benötigt Freilose, weil die Zahl der Qualifizierten keine Zweierpotenz ist."
						: null),
	};
}

export function TournamentModePanel({ initialSettings, initialVersion }: { initialSettings: TournamentSettings; initialVersion: number }) {
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [settings, setSettings] = useState(initialSettings);
	const [openAtInput, setOpenAtInput] = useState(() => toNullableDateTimeLocalValue(initialSettings.applicationOpenAt));
	const [deadlineInput, setDeadlineInput] = useState(() => toDateTimeLocalValue(initialSettings.applicationDeadline));
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const plan = describeTournamentPlan(settings.ultimateBravery);

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
		});
	}

	function saveTournamentMode(mode: TournamentMode) {
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

	function saveUltimateBravery() {
		persistSettings({ ultimateBravery: settings.ultimateBravery });
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
				<div className="rounded-[1.75rem] border border-amber-200/16 bg-amber-200/[0.045] p-5">
					<div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/64">Ultimate-Bravery-Konfiguration</div>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<label className="text-xs font-bold text-emerald-100/62">
							Tag 1
							<ThemedDateTimePicker
								ariaLabel="Startzeit von Tag 1"
								value={settings.ultimateBravery.startAt ? toDateTimeLocalValue(settings.ultimateBravery.startAt) : ""}
								onChange={(value) =>
									setSettings((current) => ({ ...current, ultimateBravery: { ...current.ultimateBravery, startAt: fromDateTimeLocalValue(value) } }))
								}
								clearable
							/>
						</label>
						<label className="text-xs font-bold text-emerald-100/62">
							Tag 2
							<ThemedDateTimePicker
								ariaLabel="Startzeit von Tag 2"
								value={settings.ultimateBravery.dayTwoStartAt ? toDateTimeLocalValue(settings.ultimateBravery.dayTwoStartAt) : ""}
								onChange={(value) =>
									setSettings((current) => ({
										...current,
										ultimateBravery: { ...current.ultimateBravery, dayTwoStartAt: fromDateTimeLocalValue(value) },
									}))
								}
								clearable
							/>
						</label>
						<label className="text-xs font-bold text-emerald-100/62">
							Gesamtzahl Teams
							<ThemedNumberInput
								min={2}
								max={32}
								value={settings.ultimateBravery.teamCount}
								ariaLabel="Gesamtzahl Teams"
								onChange={(value) => {
									const teamCount = Number(value);
									setSettings((current) => ({
										...current,
										ultimateBravery: (() => {
											const allTeamsAdvance = current.ultimateBravery.advanceTeamCount === current.ultimateBravery.teamCount;
											const swiss = swissQualification(teamCount, allTeamsAdvance);
											const advanceTeamCount =
												current.ultimateBravery.dayOneFormat === "swiss" ? swiss.advancing : Math.min(current.ultimateBravery.advanceTeamCount, teamCount);
											return {
												...current.ultimateBravery,
												teamCount,
												groupCount: Math.min(current.ultimateBravery.groupCount, teamCount),
												advanceTeamCount,
												swissRounds: current.ultimateBravery.dayOneFormat === "swiss" ? swiss.rounds : current.ultimateBravery.swissRounds,
												format:
													teamCount === 6 && advanceTeamCount === 6
														? "double-elimination-light"
														: teamCount === 4 && advanceTeamCount === 4
															? "double-elimination"
															: current.ultimateBravery.format,
											};
										})(),
									}));
								}}
							/>
						</label>
						<label className="text-xs font-bold text-emerald-100/62">
							Format an Tag 1
							<ThemedSelect
								value={settings.ultimateBravery.dayOneFormat}
								onChange={(value) =>
									setSettings((current) => {
										const dayOneFormat = value as TournamentSettings["ultimateBravery"]["dayOneFormat"];
										if (dayOneFormat !== "swiss") return { ...current, ultimateBravery: { ...current.ultimateBravery, dayOneFormat } };
										const allTeamsAdvance = current.ultimateBravery.advanceTeamCount === current.ultimateBravery.teamCount;
										const swiss = swissQualification(current.ultimateBravery.teamCount, allTeamsAdvance);
										return {
											...current,
											ultimateBravery: { ...current.ultimateBravery, dayOneFormat, advanceTeamCount: swiss.advancing, swissRounds: swiss.rounds },
										};
									})
								}
								ariaLabel="Format an Tag 1"
								options={[
									{ value: "undecided", label: "Noch nicht entschieden" },
									{ value: "groups", label: "Gruppenphase" },
									{ value: "swiss", label: "Swiss Stage" },
								]}
							/>
						</label>
						{settings.ultimateBravery.dayOneFormat === "groups" ? (
							<>
								<label className="text-xs font-bold text-emerald-100/62">
									Anzahl Gruppen
									<ThemedNumberInput
										min={1}
										max={Math.min(16, settings.ultimateBravery.teamCount)}
										value={settings.ultimateBravery.groupCount}
										ariaLabel="Anzahl Gruppen"
										onChange={(value) => setSettings((current) => ({ ...current, ultimateBravery: { ...current.ultimateBravery, groupCount: Number(value) } }))}
									/>
								</label>
								<label className="text-xs font-bold text-emerald-100/62">
									Begegnungen pro Paarung
									<ThemedSelect
										value={String(settings.ultimateBravery.groupRoundRobinLegs)}
										onChange={(value) =>
											setSettings((current) => ({
												...current,
												ultimateBravery: { ...current.ultimateBravery, groupRoundRobinLegs: Number(value) as 1 | 2 },
											}))
										}
										ariaLabel="Begegnungen pro Paarung"
										options={[
											{ value: "1", label: "Einmal gegeneinander" },
											{ value: "2", label: "Hin- und Rückrunde" },
										]}
									/>
								</label>
							</>
						) : settings.ultimateBravery.teamCount === 8 && settings.ultimateBravery.advanceTeamCount === 8 ? (
							<div className="rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.055] p-4 sm:col-span-2">
								<div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/58">Swiss-Modell automatisch erkannt</div>
								<div className="mt-1 text-sm font-black text-emerald-50">8-Team Placement Swiss · bis zu 4 Runden</div>
								<div className="mt-1 text-xs leading-5 text-emerald-100/52">Alle Teams ziehen weiter; ausgespielt werden die vollständigen Playoff-Seeds.</div>
							</div>
						) : null}
						<label className="text-xs font-bold text-emerald-100/62">
							Teams in den Playoffs
							{settings.ultimateBravery.dayOneFormat === "swiss" ? (
								<ThemedSelect
									value={settings.ultimateBravery.advanceTeamCount === settings.ultimateBravery.teamCount ? "all" : "half"}
									onChange={(value) =>
										setSettings((current) => {
											const swiss = swissQualification(current.ultimateBravery.teamCount, value === "all");
											return {
												...current,
												ultimateBravery: {
													...current.ultimateBravery,
													advanceTeamCount: swiss.advancing,
													swissRounds: swiss.rounds,
													format:
														current.ultimateBravery.teamCount === 6 && swiss.advancing === 6
															? "double-elimination-light"
															: current.ultimateBravery.format,
												},
											};
										})
									}
									ariaLabel="Teams in den Playoffs"
									options={[
										{ value: "half", label: `50 % · ${Math.max(2, Math.floor(settings.ultimateBravery.teamCount / 2))} Teams` },
										{ value: "all", label: `Alle · ${settings.ultimateBravery.teamCount} Teams` },
									]}
								/>
							) : (
								<ThemedNumberInput
									min={2}
									max={settings.ultimateBravery.teamCount}
									value={settings.ultimateBravery.advanceTeamCount}
									ariaLabel="Teams in den Playoffs"
									onChange={(value) =>
										setSettings((current) => {
											const advanceTeamCount = Number(value);
											return {
												...current,
												ultimateBravery: {
													...current.ultimateBravery,
													advanceTeamCount,
													format:
														current.ultimateBravery.teamCount === 6 && advanceTeamCount === 6
															? "double-elimination-light"
															: current.ultimateBravery.teamCount === 4 && advanceTeamCount === 4
																? "double-elimination"
																: current.ultimateBravery.format,
												},
											};
										})
									}
								/>
							)}
						</label>
						<label className="text-xs font-bold text-emerald-100/62">
							Playoff-Format
							<ThemedSelect
								value={settings.ultimateBravery.format}
								onChange={(value) =>
									setSettings((current) => ({
										...current,
										ultimateBravery: { ...current.ultimateBravery, format: value as TournamentSettings["ultimateBravery"]["format"] },
									}))
								}
								ariaLabel="Playoff-Format"
								options={[
									{ value: "undecided", label: "Noch nicht entschieden" },
									{ value: "double-elimination", label: "Double Elimination" },
									{
										value: "double-elimination-light",
										label: "Double Elimination Light",
										description:
											settings.ultimateBravery.advanceTeamCount === 6
												? "#1–#4 starten Upper, #5/#6 starten Lower"
												: "#1/#2 mit Upper-Freilos, #7/#8 starten Lower",
									},
									{ value: "single-elimination", label: "Single Elimination" },
								]}
							/>
						</label>
						{settings.ultimateBravery.format === "double-elimination-light" ? (
							<div className="rounded-2xl border border-lime-200/18 bg-lime-200/[0.065] p-4 sm:col-span-2">
								<div className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-100/62">
									Double Elimination Light · {settings.ultimateBravery.advanceTeamCount} Teams
								</div>
								<p className="mt-2 text-xs leading-5 text-emerald-100/62">
									{settings.ultimateBravery.advanceTeamCount === 6
										? "Seed #1 spielt gegen #4 und #2 gegen #3 im Upper Bracket. #5 und #6 steigen direkt gegen die Verlierer dieser Halbfinals im Lower Bracket ein."
										: "Seed #1 und #2 erhalten ein Freilos ins Upper-Halbfinale. #3 bis #6 starten in Upper Runde 1; #7 und #8 steigen direkt im Lower Bracket ein."}{" "}
									Das Grand Final ist immer ein einzelnes Do-or-die-Match ohne Bracket Reset.
								</p>
							</div>
						) : settings.ultimateBravery.format === "double-elimination" ? (
							<div className="rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.055] p-4 sm:col-span-2">
								<div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/62">
									Double Elimination · {settings.ultimateBravery.advanceTeamCount} Teams
								</div>
								<p className="mt-2 text-xs leading-5 text-emerald-100/62">
									Alle qualifizierten Teams starten im Upper Bracket. Das Grand Final ist ein einzelnes Do-or-die-Match ohne Bracket Reset.
								</p>
							</div>
						) : null}
						<div className="sm:col-span-2 rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.055] p-4">
							<div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/62">Berechneter Ablauf</div>
							<div className="mt-2 text-sm font-black text-emerald-50">{plan.stage}</div>
							<div className="mt-1 text-xs leading-5 text-emerald-100/60">{plan.qualification}</div>
							{plan.warning ? (
								<div className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-50">{plan.warning}</div>
							) : null}
						</div>
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
						<label className="text-xs font-bold text-emerald-100/62">
							Rerolls pro Spieler
							<ThemedSelect
								value={String(settings.ultimateBravery.rerollsPerPlayer)}
								onChange={(value) => setSettings((current) => ({ ...current, ultimateBravery: { ...current.ultimateBravery, rerollsPerPlayer: Number(value) } }))}
								ariaLabel="Rerolls pro Spieler"
								options={[
									{ value: "2", label: "2 Rerolls" },
									{ value: "3", label: "3 Rerolls" },
								]}
							/>
						</label>
						<div className="sm:col-span-2">
							<label htmlFor="tournament-prize-pool" className="text-xs font-bold text-emerald-100/62">
								Preisankündigung
							</label>
							<textarea
								id="tournament-prize-pool"
								value={settings.ultimateBravery.prizePool}
								maxLength={4000}
								rows={9}
								onChange={(event) => setSettings((current) => ({ ...current, ultimateBravery: { ...current.ultimateBravery, prizePool: event.target.value } }))}
								placeholder={"# Preispool\n\n- 1. Platz: ...\n- 2. Platz: ..."}
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
						Turnierdaten speichern
					</button>
				</div>
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
				</div>
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
						<span className="font-black text-emerald-50/80">{formatTournamentApplicationDeadlineLabel(settings.applicationDeadline)}</span>. Wenn der Master-Schalter
						offen ist, wird <span className="font-black text-lime-100">/apply</span> automatisch nur in diesem Zeitraum verfügbar.
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
