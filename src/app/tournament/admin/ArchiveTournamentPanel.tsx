"use client";

import { useId, useState, useTransition } from "react";
import { ARCHIVE_CONFIRMATION, slugifyTournamentId } from "@/lib/tournament-archive-shared";
import { TOURNAMENT_KIND_LABELS, TOURNAMENT_KINDS, type TournamentKind } from "@/lib/tournament-kind";

type Props = {
	activeName: string;
	championTeam: string | null;
};

const fieldClass =
	"mt-1.5 w-full rounded-xl border border-white/12 bg-black/24 px-3 py-2.5 text-sm font-semibold text-emerald-50 outline-none transition placeholder:text-emerald-100/28 focus-visible:border-lime-200/50";
const labelClass = "block text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/58";

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
			<section aria-live="polite" className="rounded-[2rem] border border-lime-200/24 bg-lime-200/[0.07] p-6">
				<div className="text-[10px] font-black uppercase tracking-[0.26em] text-lime-200/70">Archiviert</div>
				<h2 className="mt-2 text-2xl font-black text-emerald-50">{activeName} ist jetzt im Archiv.</h2>
				<p className="mt-2 text-sm leading-6 text-emerald-100/68">
					{name} läuft ab sofort im Ankündigungsmodus. {result.cleanupOperationCount} Discord-Rollen werden im Hintergrund entfernt.
				</p>
				<div className="mt-5 flex flex-wrap gap-3">
					<a
						href={`/tournament/archive/${result.archiveId}`}
						className="rounded-xl bg-lime-200 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950"
					>
						Archiv ansehen
					</a>
					<a href="/tournament/admin" className="rounded-xl border border-white/14 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-100">
						Admin neu laden
					</a>
				</div>
			</section>
		);
	}

	return (
		<section className="rounded-[2rem] border border-amber-200/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.07),rgba(7,20,13,0.92)_48%)] p-5 shadow-xl shadow-black/22 sm:p-6">
			<div className="max-w-3xl">
				<div className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-100/64">Lebenszyklus · Abschluss</div>
				<h2 className="mt-2 text-2xl font-black text-emerald-50">{activeName} archivieren und nächstes Turnier vorbereiten</h2>
				<p className="mt-2 text-sm leading-6 text-emerald-100/60">
					Sichert Teams, Stage, Bracket, Drafts und Builds dauerhaft im öffentlichen Archiv. Danach werden Bewerbungen, Matches, Roster und Wunschgruppen geleert, die
					Teamrollen in Discord entfernt und das nächste Turnier im Ankündigungsmodus aktiviert. Verknüpfte Riot- und Twitch-Konten bleiben erhalten.
				</p>
			</div>
			{championTeam ? (
				<p className="mt-4 inline-flex rounded-full border border-amber-100/24 bg-amber-200/10 px-3 py-1.5 text-xs font-black text-amber-50">Champion: {championTeam}</p>
			) : (
				<p role="alert" className="mt-4 rounded-2xl border border-red-300/24 bg-red-500/10 p-3 text-sm font-bold text-red-50">
					Das Grand Final hat noch kein gültiges Ergebnis. Erst danach kann archiviert werden.
				</p>
			)}

			<form onSubmit={submit} className="mt-6 grid gap-5 lg:grid-cols-2" aria-describedby={`${formId}-warning`}>
				<fieldset className="grid gap-4 rounded-2xl border border-white/10 bg-black/14 p-4">
					<legend className="px-1 text-xs font-black uppercase tracking-[0.18em] text-lime-100">Nächstes Turnier</legend>
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
						<span className="mt-1 block text-[11px] font-semibold normal-case tracking-normal text-emerald-100/42">
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

				<fieldset className="grid content-start gap-4 rounded-2xl border border-white/10 bg-black/14 p-4">
					<legend className="px-1 text-xs font-black uppercase tracking-[0.18em] text-lime-100">Archiv-Eintrag</legend>
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
						className="rounded-xl bg-gradient-to-r from-amber-200 via-orange-200 to-rose-200 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-red-950 shadow-lg shadow-amber-300/16 transition disabled:opacity-45"
					>
						{isPending ? "Archiviere…" : "Archivieren & wechseln"}
					</button>
					<p id={`${formId}-warning`} className="text-xs leading-5 text-amber-50/64 lg:col-span-2">
						Dieser Schritt lässt sich nicht rückgängig machen. Die Daten bleiben nur im Archiv-Snapshot erhalten.
					</p>
					{error ? (
						<p role="alert" className="rounded-xl border border-red-300/24 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-50 lg:col-span-2">
							{error}
						</p>
					) : null}
				</div>
			</form>
		</section>
	);
}
