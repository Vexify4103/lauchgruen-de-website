"use client";

import { useId, useState, useTransition } from "react";
import { ARCHIVE_CONFIRMATION, slugifyTournamentId } from "@/lib/tournament-archive-shared";
import { TOURNAMENT_KIND_LABELS, TOURNAMENT_KINDS, type TournamentKind } from "@/lib/tournament-kind";

type Props = {
	activeName: string;
	championTeam: string | null;
};

const fieldClass =
	"mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)]";
const labelClass = "block text-xs font-semibold text-[var(--muted)]";

export function ArchiveTournamentPanel({ activeName, championTeam }: Props) {
	const formId = useId();
	const [name, setName] = useState("Fearless Turnier");
	const [season, setSeason] = useState("Fearless Turnier 2026");
	const [id, setId] = useState("fearless-2026");
	const [idTouched, setIdTouched] = useState(false);
	const [kind, setKind] = useState<TournamentKind>("fearless");
	const [note, setNote] = useState("");
	const [vodUrl, setVodUrl] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState("");
	const [result, setResult] = useState<{ archiveId: string; cleanupOperationCount: number } | null>(null);
	const [isPending, startTransition] = useTransition();
	const canSubmit = Boolean(championTeam) && confirmation === ARCHIVE_CONFIRMATION && !isPending;

	function submit(event: React.FormEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		setError("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/archive", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ confirmation, note, vodUrl, next: { id, name, season, kind } }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string; archiveId?: string; cleanupOperationCount?: number } | null;
			if (!response.ok || !json?.archiveId) {
				setError(json?.message ?? "Archivierung fehlgeschlagen.");
				return;
			}
			setResult({ archiveId: json.archiveId, cleanupOperationCount: json.cleanupOperationCount ?? 0 });
		});
	}

	if (result) {
		return (
			<section aria-live="polite" className="rounded-[16px] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-6">
				<div className="text-xs font-semibold text-[var(--accent)]">Archiviert</div>
				<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">{activeName} ist jetzt im Archiv</h2>
				<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
					{name} läuft ab sofort im Ankündigungsmodus. {result.cleanupOperationCount} Discord-Rollen werden im Hintergrund entfernt.
				</p>
				<div className="mt-5 flex flex-wrap gap-3">
					<a
						href={`/tournament/archive/${result.archiveId}`}
						className="rounded-xl bg-[var(--accent)] px-4 py-3 text-xs font-semibold text-[var(--on-accent)]"
					>
						Archiv ansehen
					</a>
					<a href="/tournament/admin" className="rounded-xl border border-[var(--line)] px-4 py-3 text-xs font-semibold text-[var(--text)]">
						Admin neu laden
					</a>
				</div>
			</section>
		);
	}

	return (
		<section className="rounded-[16px] border border-[var(--line)] bg-[var(--admin-surface)] p-5 sm:p-6">
			<div className="max-w-3xl">
				<div className="text-xs font-semibold text-[var(--muted)]">Lebenszyklus · Abschluss</div>
				<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">{activeName} archivieren und nächstes Turnier vorbereiten</h2>
				<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
					Sichert Teams, Stage, Bracket, Drafts und Builds dauerhaft im öffentlichen Archiv. Danach werden Bewerbungen, Matches, Roster und Wunschgruppen geleert, die
					Teamrollen in Discord entfernt und das nächste Turnier im Ankündigungsmodus aktiviert. Verknüpfte Riot- und Twitch-Konten bleiben erhalten.
				</p>
			</div>
			{championTeam ? (
				<p className="mt-4 inline-flex rounded-full border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--amber)]">Champion: {championTeam}</p>
			) : (
				<p role="alert" className="mt-4 rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3 text-sm font-medium text-[var(--danger)]">
					Das Grand Final hat noch kein gültiges Ergebnis. Erst danach kann archiviert werden.
				</p>
			)}

			<form onSubmit={submit} className="mt-6 grid gap-5 lg:grid-cols-2" aria-describedby={`${formId}-warning`}>
				<fieldset className="grid gap-4 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
					<legend className="px-1 text-xs font-semibold text-[var(--accent)]">Nächstes Turnier</legend>
					<label className={labelClass}>
						Name
						<input
							className={fieldClass}
							name="next-name"
							autoComplete="off"
							required
							minLength={3}
							maxLength={80}
							value={name}
							onChange={(event) => {
								setName(event.target.value);
								if (!idTouched) setId(slugifyTournamentId(`${event.target.value} ${new Date().getFullYear()}`));
							}}
						/>
					</label>
					<label className={labelClass}>
						Saison-Label
						<input
							className={fieldClass}
							name="next-season"
							autoComplete="off"
							required
							minLength={3}
							maxLength={80}
							value={season}
							onChange={(event) => setSeason(event.target.value)}
						/>
					</label>
					<label className={labelClass}>
						Archiv-ID
						<input
							className={`${fieldClass} font-mono`}
							name="next-id"
							autoComplete="off"
							spellCheck={false}
							required
							pattern="[a-z0-9]+(-[a-z0-9]+)*"
							value={id}
							onChange={(event) => {
								setIdTouched(true);
								setId(slugifyTournamentId(event.target.value));
							}}
						/>
						<span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[var(--muted)]">
							Wird später zur Archiv-URL /tournament/archive/{id || "…"}
						</span>
					</label>
					<label className={labelClass}>
						Regelwerk
						<select className={fieldClass} name="next-kind" value={kind} onChange={(event) => setKind(event.target.value as TournamentKind)}>
							{TOURNAMENT_KINDS.map((entry) => (
								<option key={entry} value={entry}>
									{TOURNAMENT_KIND_LABELS[entry]}
								</option>
							))}
						</select>
					</label>
				</fieldset>

				<fieldset className="grid content-start gap-4 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
					<legend className="px-1 text-xs font-semibold text-[var(--accent)]">Archiv-Eintrag</legend>
					<label className={labelClass}>
						Notiz (optional)
						<textarea className={`${fieldClass} min-h-24`} name="archive-note" maxLength={1200} value={note} onChange={(event) => setNote(event.target.value)} />
					</label>
					<label className={labelClass}>
						VOD-Link (optional)
						<input
							className={fieldClass}
							type="url"
							name="archive-vod"
							inputMode="url"
							autoComplete="off"
							placeholder="https://www.twitch.tv/videos/…"
							value={vodUrl}
							onChange={(event) => setVodUrl(event.target.value)}
						/>
					</label>
				</fieldset>

				<div className="grid gap-3 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
					<label className={labelClass}>
						Zur Bestätigung „{ARCHIVE_CONFIRMATION}“ eingeben
						<input
							className={`${fieldClass} font-mono`}
							name="archive-confirmation"
							autoComplete="off"
							spellCheck={false}
							value={confirmation}
							onChange={(event) => setConfirmation(event.target.value)}
						/>
					</label>
					<button
						type="submit"
						disabled={!canSubmit}
						className="bg-[var(--accent)] rounded-xl px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition disabled:opacity-45"
					>
						{isPending ? "Archiviere…" : "Archivieren & wechseln"}
					</button>
					<p id={`${formId}-warning`} className="text-xs leading-5 text-[var(--muted)] lg:col-span-2">
						Dieser Schritt lässt sich nicht rückgängig machen. Die Daten bleiben nur im Archiv-Snapshot erhalten.
					</p>
					{error ? (
						<p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-sm font-medium text-[var(--danger)] lg:col-span-2">
							{error}
						</p>
					) : null}
				</div>
			</form>
		</section>
	);
}
