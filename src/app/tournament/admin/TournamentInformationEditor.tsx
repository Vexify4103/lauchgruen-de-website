"use client";

import { useEffect, useState, type FormEvent } from "react";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { LoadingOrb } from "@/components/LoadingIndicator";
import { TournamentMarkdown } from "@/components/TournamentMarkdown";
import type { TournamentSettings } from "@/lib/tournament-settings";

export function TournamentInformationEditor({
	settings,
	initialVersion,
	defaultRules,
	onSaved,
	onDirtyChange,
}: {
	settings: TournamentSettings;
	initialVersion: number;
	defaultRules: string;
	onSaved: () => void;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const initial = {
		name: settings.activeTournament.name,
		description: settings.activeTournament.description ?? "",
		rulesMarkdown: settings.activeTournament.rulesMarkdown ?? "",
	};
	const [baseline, setBaseline] = useState(initial);
	const [draft, setDraft] = useState(initial);
	const [version, setVersion] = useState(initialVersion);
	const [pending, setPending] = useState(false);
	const [preview, setPreview] = useState(false);
	const [message, setMessage] = useState("");
	const [failed, setFailed] = useState(false);
	const { showConflict } = useAdminConflict();
	const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

	useEffect(() => {
		onDirtyChange(dirty);
	}, [dirty, onDirtyChange]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	async function save(event: FormEvent) {
		event.preventDefault();
		if (pending) return;
		setPending(true);
		setMessage("");
		setFailed(false);
		try {
			const response = await fetch("/api/tournament/settings", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ expectedVersion: version, tournamentInformation: draft }),
			});
			const json = await response.json();
			if (!response.ok) {
				if (isAdminVersionConflict(response, json)) showConflict(json);
				throw new Error(json?.message ?? "Turnierinformationen konnten nicht gespeichert werden.");
			}
			const active = (json.settings as TournamentSettings).activeTournament;
			const saved = { name: active.name, description: active.description ?? "", rulesMarkdown: active.rulesMarkdown ?? "" };
			setDraft(saved);
			setBaseline(saved);
			setVersion(json.version);
			setMessage("Turnierinformationen gespeichert. Die öffentlichen Seiten verwenden jetzt diese Inhalte.");
			onSaved();
		} catch (error) {
			setFailed(true);
			setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen. Bitte erneut versuchen.");
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={save} className="grid gap-5">
			<p className="text-sm leading-6 text-[var(--muted)]">
				Öffentliche Texte bearbeiten, ohne Format, Teams oder Matches zu verändern. Änderungen werden erst mit „Informationen speichern“ veröffentlicht.
			</p>
			<fieldset disabled={pending} className="grid min-w-0 gap-5">
				<label className="grid gap-2 text-sm font-bold">
					Turniername
					<input
						name="tournament-name"
						required
						maxLength={160}
						autoComplete="off"
						className="builder-input"
						value={draft.name}
						onChange={(event) => {
							setPreview(false);
							setDraft({ ...draft, name: event.target.value });
						}}
					/>
				</label>
				<label className="grid gap-2 text-sm font-bold">
					Beschreibung
					<textarea
						name="tournament-description"
						rows={5}
						maxLength={8000}
						className="builder-input resize-y"
						value={draft.description}
						onChange={(event) => {
							setPreview(false);
							setDraft({ ...draft, description: event.target.value });
						}}
						placeholder="Beschreibe das Turnier…"
					/>
				</label>
				<div className="grid gap-2">
					<label htmlFor="tournament-rules" className="text-sm font-bold">
						Regelwerk (Markdown)
					</label>
					<p className="text-sm text-[var(--muted)]">
						Leer lassen: Das bestehende, automatisch zum Format passende Regelwerk bleibt aktiv. Eigene Regeln ersetzen den gesamten Regeltext; Format-Einstellungen
						werden dadurch nicht geändert.
					</p>
					<textarea
						id="tournament-rules"
						name="tournament-rules"
						rows={14}
						maxLength={30000}
						className="builder-input resize-y font-mono"
						value={draft.rulesMarkdown}
						onChange={(event) => {
							setPreview(false);
							setDraft({ ...draft, rulesMarkdown: event.target.value });
						}}
						placeholder="## Teilnahme\n\n- Eure Regeln…"
					/>
					<div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
						<span>## Überschrift · - Liste · **fett** · _kursiv_ · ~~durchgestrichen~~ · [Link](https://…)</span>
						<span>{draft.rulesMarkdown.length}/30000</span>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className="button ghost small"
							onClick={() => {
								if (!draft.rulesMarkdown || window.confirm("Den aktuellen Regelentwurf durch die Standardregeln ersetzen?"))
									setDraft({ ...draft, rulesMarkdown: defaultRules });
							}}
						>
							Standardregeln als Vorlage
						</button>
						<button
							type="button"
							className="button ghost small"
							onClick={() => {
								if (window.confirm("Eigene Regeln entfernen und wieder automatische Standardregeln verwenden?")) setDraft({ ...draft, rulesMarkdown: "" });
							}}
						>
							Standardregeln verwenden
						</button>
						<button type="button" className="button ghost small" aria-pressed={preview} onClick={() => setPreview(!preview)}>
							{preview ? "Vorschau schließen" : "Vorschau anzeigen"}
						</button>
					</div>
				</div>
			</fieldset>
			{preview ? (
				<section className="content-panel">
					<h2 className="mb-4 text-2xl font-bold">{draft.name}</h2>
					<p className="mb-5 whitespace-pre-wrap text-[var(--muted)]">{draft.description}</p>
					<TournamentMarkdown>{draft.rulesMarkdown.trim() || defaultRules}</TournamentMarkdown>
				</section>
			) : null}
			{message ? (
				<p role={failed ? "alert" : "status"} className={failed ? "text-red-200" : "text-[var(--accent)]"}>
					{message}
				</p>
			) : null}
			<button type="submit" disabled={pending || !dirty} className="button primary justify-self-start" aria-busy={pending}>
				{pending ? (
					<>
						<LoadingOrb /> Speichert…
					</>
				) : (
					"Informationen speichern"
				)}
			</button>
		</form>
	);
}
