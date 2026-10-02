"use client";

import { useState, type FormEvent } from "react";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { normalizeWishGroupMode, wishGroupLimit, type WishGroupMode } from "@/lib/preference-group-settings";
import type { TournamentSettings } from "@/lib/tournament-settings";

const OPTIONS: { value: WishGroupMode; title: string; description: string }[] = [
	{ value: "disabled", title: "Deaktiviert", description: "Nur Einzelbewerbungen. Wunschgruppen werden nicht berücksichtigt." },
	{ value: "duo", title: "Duo", description: "Gemeinsam bewerben mit bis zu zwei Personen." },
	{ value: "team", title: "Wunschgruppe", description: "Gemeinsam bewerben mit bis zu fünf Personen." },
];

export function PreferenceGroupSettingsEditor({ settings, initialVersion, onSaved }: { settings: TournamentSettings; initialVersion: number; onSaved: () => void }) {
	const [mode, setMode] = useState(normalizeWishGroupMode(settings.wishGroupMode));
	const [baseline, setBaseline] = useState(mode);
	const [version, setVersion] = useState(initialVersion);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const [failed, setFailed] = useState(false);
	const { showConflict } = useAdminConflict();

	async function save(event: FormEvent) {
		event.preventDefault();
		if (pending || mode === baseline) return;
		if (
			wishGroupLimit(mode) < wishGroupLimit(baseline) &&
			!window.confirm("Bestehende Gruppen bleiben gespeichert. Deaktivierte oder zu große Gruppen werden nicht mehr im Roster-Builder berücksichtigt. Einstellung ändern?")
		)
			return;
		setPending(true);
		setMessage("");
		setFailed(false);
		try {
			const response = await fetch("/api/tournament/settings", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ expectedVersion: version, wishGroupMode: mode }),
			});
			const json = await response.json();
			if (!response.ok) {
				if (isAdminVersionConflict(response, json)) showConflict(json);
				throw new Error(json.message ?? "Speichern fehlgeschlagen.");
			}
			const saved = normalizeWishGroupMode(json.settings.wishGroupMode);
			setMode(saved);
			setBaseline(saved);
			setVersion(json.version);
			setMessage("Wunschgruppen-Einstellung gespeichert.");
			onSaved();
		} catch (error) {
			setFailed(true);
			setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={save} className="grid gap-5">
			<fieldset disabled={pending} className="grid gap-3">
				<legend className="mb-3 text-sm font-bold">Welche Wunschgruppen sind erlaubt?</legend>
				{OPTIONS.map((option) => (
					<label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-4">
						<input
							type="radio"
							name="wish-group-mode"
							value={option.value}
							checked={mode === option.value}
							onChange={() => setMode(option.value)}
							className="mt-1 accent-[var(--accent)]"
						/>
						<span className="grid gap-1">
							<strong>{option.title}</strong>
							<span className="text-sm text-[var(--muted)]">{option.description}</span>
						</span>
					</label>
				))}
			</fieldset>
			<p className="text-sm leading-6 text-[var(--muted)]">
				Bestehende Gruppen bleiben gespeichert. Deaktivierte oder zu große Gruppen werden nicht im Roster-Builder berücksichtigt. Bereits veröffentlichte Teams bleiben
				unverändert. Team-Balance hat weiterhin Vorrang.
			</p>
			<button type="submit" className="button primary justify-self-start" disabled={pending || mode === baseline}>
				{pending ? "Wird gespeichert..." : "Wunschgruppen speichern"}
			</button>
			{message ? (
				<p role={failed ? "alert" : "status"} className="text-sm">
					{message}
				</p>
			) : null}
		</form>
	);
}
