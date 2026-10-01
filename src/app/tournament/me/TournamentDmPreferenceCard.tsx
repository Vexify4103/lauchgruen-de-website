"use client";

import { useState } from "react";

/** Inline switch for tournament DMs from the Discord bot (team publication, assignment, captain role). */
export function TournamentDmPreferenceCard({ initialEnabled }: { initialEnabled: boolean }) {
	const [enabled, setEnabled] = useState(initialEnabled);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function updatePreference(nextEnabled: boolean) {
		setSaving(true);
		setError(null);
		const response = await fetch("/api/tournament/application-preferences", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ discordDmOptIn: nextEnabled }),
		});
		const result = (await response.json().catch(() => null)) as { message?: string } | null;
		setSaving(false);
		if (!response.ok) {
			setError(result?.message ?? "Die DM-Einstellung konnte nicht gespeichert werden.");
			return;
		}
		setEnabled(nextEnabled);
	}

	return (
		<>
			<label className="dm-toggle" title="Der Bot schreibt dir, wenn Teams veröffentlicht werden, du einem Team zugeteilt wirst oder Captain bist.">
				<input type="checkbox" checked={enabled} disabled={saving} onChange={(event) => void updatePreference(event.target.checked)} />
				<i />
				{saving ? "Speichert…" : "Bot-DMs"}
			</label>
			{error ? (
				<span role="alert" className="queue-note text-[var(--danger)]">
					{error}
				</span>
			) : null}
		</>
	);
}
