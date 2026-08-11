"use client";

import { useState } from "react";

export function TournamentDmPreferenceCard({ initialEnabled }: { initialEnabled: boolean }) {
	const [enabled, setEnabled] = useState(initialEnabled);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	async function updatePreference(nextEnabled: boolean) {
		setSaving(true);
		setMessage(null);
		const response = await fetch("/api/tournament/application-preferences", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ discordDmOptIn: nextEnabled }),
		});
		const result = (await response.json().catch(() => null)) as { message?: string } | null;
		setSaving(false);
		if (!response.ok) {
			setMessage(result?.message ?? "Die DM-Einstellung konnte nicht gespeichert werden.");
			return;
		}
		setEnabled(nextEnabled);
		setMessage(nextEnabled ? "Turnier-DMs sind aktiviert." : "Turnier-DMs sind deaktiviert.");
	}

	return (
		<section className="rounded-[2rem] border border-indigo-200/14 bg-gradient-to-br from-indigo-300/[0.08] via-white/[0.035] to-cyan-300/[0.05] p-5 shadow-xl shadow-black/18 sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="max-w-2xl">
					<div className="text-xs font-black uppercase tracking-[0.28em] text-indigo-100/64">Discord-DMs</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Wichtige Turnier-News direkt erhalten.</h2>
					<p className="mt-2 text-sm leading-7 text-emerald-100/58">
						Der Bot informiert dich, wenn Teams veröffentlicht werden, du einem Team zugeteilt wurdest oder Captain bist. Du kannst diese Nachrichten jederzeit
						abschalten.
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={enabled}
					disabled={saving}
					onClick={() => void updatePreference(!enabled)}
					className={`relative flex min-w-32 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition disabled:cursor-wait disabled:opacity-60 ${
						enabled ? "border-lime-200/30 bg-lime-200/12 text-lime-50" : "border-white/12 bg-black/20 text-emerald-100/52"
					}`}
				>
					<span>{saving ? "Speichert…" : enabled ? "Aktiv" : "Aus"}</span>
					<span className={`h-5 w-9 rounded-full p-0.5 transition ${enabled ? "bg-lime-200" : "bg-white/16"}`}>
						<span className={`block size-4 rounded-full bg-emerald-950 transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
					</span>
				</button>
			</div>
			{message ? <p className="mt-4 rounded-xl border border-white/9 bg-black/16 px-4 py-3 text-xs font-bold text-emerald-100/70">{message}</p> : null}
		</section>
	);
}
