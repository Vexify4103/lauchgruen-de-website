"use client";

import { useState, useTransition } from "react";
import { slugifyTournamentId } from "@/lib/tournament-archive-shared";
import { TOURNAMENT_KIND_LABELS, TOURNAMENT_KINDS, type TournamentKind } from "@/lib/tournament-kind";
import type { TournamentSettings } from "@/lib/tournament-settings";

const fieldClass =
	"mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)] disabled:opacity-60";
const labelClass = "block text-xs font-semibold text-[var(--muted)]";

/** Edits the announced tournament while it is a teaser. Id and type lock once applications exist. */
export function UpcomingTournamentEditor({
	active,
	initialVersion,
	identityLocked,
	onSaved,
}: {
	active: TournamentSettings["activeTournament"];
	initialVersion: number;
	identityLocked: boolean;
	onSaved: () => void;
}) {
	const [name, setName] = useState(active.name);
	const [season, setSeason] = useState(active.season);
	const [id, setId] = useState(active.id);
	const [kind, setKind] = useState<TournamentKind>(active.kind);
	const [version, setVersion] = useState(initialVersion);
	const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
	const [isPending, startTransition] = useTransition();
	const dirty = name !== active.name || season !== active.season || id !== active.id || kind !== active.kind;

	function submit(event: React.FormEvent) {
		event.preventDefault();
		if (!dirty || isPending) return;
		setMessage(null);
		startTransition(async () => {
			const response = await fetch("/api/tournament/upcoming", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id, name, season, kind, expectedVersion: version }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string; version?: number } | null;
			if (typeof json?.version === "number") setVersion(json.version);
			if (!response.ok) {
				setMessage({ tone: "error", text: json?.message ?? "Speichern fehlgeschlagen. Bitte neu laden." });
				return;
			}
			setMessage({ tone: "ok", text: "Gespeichert." });
			onSaved();
		});
	}

	return (
		<section className="rounded-[16px] border border-[var(--line)] bg-[var(--admin-surface)] p-5 sm:p-6">
			<div className="text-xs font-semibold text-[var(--muted)]">Ankündigung</div>
			<h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Nächstes Turnier bearbeiten</h2>
			<p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
				Solange das Turnier nur angekündigt ist, lassen sich Name, Saison, Turnierart und ID ändern.
				{identityLocked ? " Es gibt schon Bewerbungen, deshalb sind ID und Turnierart jetzt fest." : " ID und Turnierart werden mit der ersten Bewerbung fest."}
			</p>
			<form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
				<label className={labelClass}>
					Name
					<input className={fieldClass} name="upcoming-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
				</label>
				<label className={labelClass}>
					Saison
					<input className={fieldClass} name="upcoming-season" value={season} onChange={(event) => setSeason(event.target.value)} maxLength={80} required />
				</label>
				<label className={labelClass}>
					Turnierart
					<select className={fieldClass} name="upcoming-kind" value={kind} disabled={identityLocked} onChange={(event) => setKind(event.target.value as TournamentKind)}>
						{TOURNAMENT_KINDS.map((entry) => (
							<option key={entry} value={entry}>
								{TOURNAMENT_KIND_LABELS[entry]}
							</option>
						))}
					</select>
				</label>
				<label className={labelClass}>
					ID (intern, später Teil der Archiv-Adresse)
					<input
						className={`${fieldClass} font-mono`}
						name="upcoming-id"
						value={id}
						disabled={identityLocked}
						onChange={(event) => setId(event.target.value)}
						onBlur={() => setId(slugifyTournamentId(id))}
						spellCheck={false}
						maxLength={48}
						required
					/>
				</label>
				<div className="flex flex-wrap items-center gap-3 sm:col-span-2">
					<button
						type="submit"
						disabled={!dirty || isPending}
						className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-[var(--on-accent)] transition disabled:opacity-45"
					>
						{isPending ? "Speichert…" : "Speichern"}
					</button>
					{message ? (
						<p role="status" className={`m-0 text-sm ${message.tone === "ok" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
							{message.text}
						</p>
					) : null}
				</div>
			</form>
		</section>
	);
}
