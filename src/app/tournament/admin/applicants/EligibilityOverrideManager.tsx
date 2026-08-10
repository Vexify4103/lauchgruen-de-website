"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { ThemedSelect } from "@/components/ThemedSelect";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import type { TournamentEligibilityOverride, TournamentEligibilityOverrideKind } from "@/lib/tournament-storage";

const kindOptions = [
	{
		value: "exception",
		label: "Ausnahme",
		description: "Gilt nur für das aktuell aktive Turnier.",
	},
	{
		value: "regular",
		label: "Dauergast",
		description: "Bleibt auch für zukünftige Turniere bestehen.",
	},
];

function isActive(entry: TournamentEligibilityOverride, tournamentId: string) {
	return entry.kind === "regular" || entry.tournamentId === tournamentId;
}

export function EligibilityOverrideManager({
	initialEntries,
	initialVersion,
	activeTournamentId,
	activeTournamentName,
}: {
	initialEntries: TournamentEligibilityOverride[];
	initialVersion: number;
	activeTournamentId: string;
	activeTournamentName: string;
}) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [entries, setEntries] = useState(initialEntries);
	const [version, setVersion] = useState(initialVersion);
	const [kind, setKind] = useState<TournamentEligibilityOverrideKind>("exception");
	const [discordId, setDiscordId] = useState("");
	const [riotId, setRiotId] = useState("");
	const [note, setNote] = useState("");
	const [message, setMessage] = useState("");
	const [listOpen, setListOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const activeEntries = entries.filter((entry) => isActive(entry, activeTournamentId));

	async function persistEntry(): Promise<boolean> {
		setMessage("");
		const response = await fetch("/api/tournament/eligibility-overrides", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				discordId: discordId.trim() || undefined,
				riotId: riotId.trim() || undefined,
				kind,
				note: note.trim(),
				bypassMinimumSummonerLevel: true,
				expectedVersion: version,
			}),
		});
		const json = (await response.json().catch(() => null)) as { message?: string; version?: number; entry?: TournamentEligibilityOverride } | null;
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage(json?.message ?? "Teilnahme-Freigabe konnte nicht gespeichert werden.");
			return false;
		}
		if (json?.version !== undefined) setVersion(json.version);
		if (json?.entry) {
			setEntries((current) => [json.entry!, ...current.filter((entry) => entry.id !== json.entry!.id)]);
			setListOpen(true);
		}
		setDiscordId("");
		setRiotId("");
		setNote("");
		setMessage(kind === "regular" ? "Dauergast dauerhaft freigegeben." : `Ausnahme für ${activeTournamentName} gespeichert.`);
		router.refresh();
		return true;
	}

	useUnsavedChanges({
		dirty: Boolean(discordId.trim() || riotId.trim() || note.trim()),
		label: "Teilnahme-Freigabe",
		save: persistEntry,
	});

	function addEntry(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		startTransition(async () => {
			await persistEntry();
		});
	}

	function removeEntry(id: string) {
		setMessage("");
		startTransition(async () => {
			const response = await fetch(`/api/tournament/eligibility-overrides?id=${encodeURIComponent(id)}&expectedVersion=${version}`, { method: "DELETE" });
			const json = (await response.json().catch(() => null)) as { message?: string; version?: number } | null;
			if (!response.ok) {
				if (isAdminVersionConflict(response, json)) {
					showConflict(json);
					return;
				}
				setMessage(json?.message ?? "Teilnahme-Freigabe konnte nicht entfernt werden.");
				return;
			}
			if (json?.version !== undefined) setVersion(json.version);
			setEntries((current) => current.filter((entry) => entry.id !== id));
			setMessage("Teilnahme-Freigabe entfernt.");
			router.refresh();
		});
	}

	return (
		<section className="mt-8 rounded-[2rem] border border-cyan-200/16 bg-gradient-to-br from-cyan-300/[0.07] via-emerald-300/[0.035] to-lime-200/[0.055] p-5 shadow-xl shadow-black/20">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="max-w-3xl">
					<div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/70">Teilnahme-Freigaben</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Ausnahmen und Dauergäste verwalten</h2>
					<p className="mt-2 text-sm leading-6 text-emerald-100/64">
						Beide Kategorien umgehen das Account-Mindestlevel. Discord-Mitgliedschaft, Riot-Verifizierung und Blacklist bleiben immer aktiv.
					</p>
				</div>
				<div className="rounded-2xl border border-cyan-100/16 bg-black/20 px-4 py-2 text-sm font-black text-cyan-50">{activeEntries.length} aktiv</div>
			</div>

			<form onSubmit={addEntry} className="mt-5 grid gap-3 rounded-2xl border border-white/8 bg-black/16 p-4 lg:grid-cols-[0.8fr_1fr_1fr_1.45fr_auto] lg:items-end">
				<label className="grid gap-2">
					<span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/64">Kategorie</span>
					<ThemedSelect
						value={kind}
						onChange={(value) => setKind(value as TournamentEligibilityOverrideKind)}
						options={kindOptions}
						ariaLabel="Kategorie der Teilnahme-Freigabe"
					/>
				</label>
				<Field label="Discord-ID" value={discordId} onChange={setDiscordId} placeholder="337568120028004362" />
				<Field label="Riot-ID" value={riotId} onChange={setRiotId} placeholder="Name#TAG" />
				<Field label="Interner Grund" value={note} onChange={setNote} placeholder="Warum wird die Anforderung umgangen?" required />
				<button
					type="submit"
					disabled={isPending || (!discordId.trim() && !riotId.trim()) || note.trim().length < 3}
					className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-lg shadow-lime-300/10 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
				>
					Freigeben
				</button>
			</form>

			{message ? <div className="mt-4 rounded-2xl border border-cyan-100/16 bg-black/22 px-4 py-3 text-sm font-bold text-cyan-50">{message}</div> : null}

			{entries.length > 0 ? (
				<details
					open={listOpen}
					onToggle={(event) => setListOpen((event.currentTarget as HTMLDetailsElement).open)}
					className="group mt-5 rounded-2xl border border-white/8 bg-black/14 p-4"
				>
					<summary className="cursor-pointer list-none text-sm font-black text-emerald-50 marker:hidden">
						<span className="inline-flex items-center gap-2">
							<span className="grid size-6 place-items-center rounded-full border border-cyan-100/16 bg-cyan-100/8" aria-hidden="true">
								<span className="size-2 rotate-45 border-b-2 border-r-2 border-cyan-100/72 transition-transform duration-200 group-open:-rotate-[135deg]" />
							</span>
							Alle Freigaben anzeigen ({entries.length})
						</span>
					</summary>
					<div className="mt-4 max-h-80 overflow-y-auto pr-1">
						<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							{entries.map((entry) => {
								const active = isActive(entry, activeTournamentId);
								return (
									<article
										key={entry.id}
										className={`rounded-2xl border p-4 ${active ? "border-cyan-100/16 bg-cyan-200/[0.055]" : "border-white/8 bg-black/20 opacity-55"}`}
									>
										<div className="flex items-center justify-between gap-2">
											<span
												className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${entry.kind === "regular" ? "border-lime-200/24 bg-lime-200/10 text-lime-50" : "border-cyan-200/24 bg-cyan-200/10 text-cyan-50"}`}
											>
												{entry.kind === "regular" ? "Dauergast" : "Ausnahme"}
											</span>
											{!active ? <span className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-100/72">Abgelaufen</span> : null}
										</div>
										<div className="mt-3 grid gap-1.5 text-sm">
											<Row label="Discord">{entry.discordId ?? "—"}</Row>
											<Row label="Riot">{entry.riotId ?? "—"}</Row>
											<Row label="Gültig">
												{entry.kind === "regular" ? "Dauerhaft" : entry.tournamentId === activeTournamentId ? activeTournamentName : entry.tournamentId}
											</Row>
											<Row label="Freigabe">Mindestlevel</Row>
											<Row label="Grund">{entry.note}</Row>
										</div>
										<button
											type="button"
											disabled={isPending}
											onClick={() => removeEntry(entry.id)}
											className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-red-100/72 underline decoration-red-200/30 underline-offset-4 hover:text-red-50 disabled:opacity-50"
										>
											Entfernen
										</button>
									</article>
								);
							})}
						</div>
					</div>
				</details>
			) : null}
		</section>
	);
}

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
	return (
		<label className="grid gap-2">
			<span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/64">{label}</span>
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				required={required}
				placeholder={placeholder}
				className="rounded-xl border border-cyan-100/12 bg-black/24 px-3 py-2.5 text-sm font-bold text-emerald-50 outline-none placeholder:text-emerald-100/26 focus:border-cyan-100/38"
			/>
		</label>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[4.5rem_1fr] gap-2">
			<span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/48">{label}</span>
			<span className="break-words font-bold text-emerald-50/82">{children}</span>
		</div>
	);
}
