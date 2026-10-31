"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
	const [pendingRemoval, setPendingRemoval] = useState<TournamentEligibilityOverride | null>(null);
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
		<section className="mt-8 rounded-[16px] border border-[var(--line)] p-5">
			<ConfirmDialog
				open={Boolean(pendingRemoval)}
				tone="danger"
				title="Ausnahme entfernen?"
				description="Für diese Person gilt danach wieder das normale Mindestlevel. Bestehende Bewerbungen werden nicht gelöscht."
				confirmLabel="Ausnahme entfernen"
				cancelLabel="Abbrechen"
				onConfirm={() => {
					if (pendingRemoval) removeEntry(pendingRemoval.id);
					setPendingRemoval(null);
				}}
				onCancel={() => setPendingRemoval(null)}
			/>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="max-w-3xl">
					<div className="text-xs font-semibold text-[var(--muted)]">Teilnahme-Freigaben</div>
					<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Ausnahmen und Dauergäste verwalten</h2>
					<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
						Beide Kategorien umgehen das Account-Mindestlevel. Discord-Mitgliedschaft, Riot-Verifizierung und Blacklist bleiben immer aktiv.
					</p>
				</div>
				<div className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] px-4 py-2 text-sm font-semibold text-[var(--text)]">{activeEntries.length} aktiv</div>
			</div>

			<form onSubmit={addEntry} className="mt-5 grid gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4 lg:grid-cols-[0.8fr_1fr_1fr_1.45fr_auto] lg:items-end">
				<label className="grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Kategorie</span>
					<ThemedSelect
						value={kind}
						onChange={(value) => setKind(value as TournamentEligibilityOverrideKind)}
						options={kindOptions}
						ariaLabel="Kategorie der Teilnahme-Freigabe"
					/>
				</label>
				<Field label="Discord-ID" value={discordId} onChange={setDiscordId} placeholder="337568120028004362…" />
				<Field label="Riot-ID" value={riotId} onChange={setRiotId} placeholder="Name#TAG…" />
				<Field label="Interner Grund" value={note} onChange={setNote} placeholder="Warum wird die Anforderung umgangen?…" required />
				<button
					type="submit"
					disabled={isPending || (!discordId.trim() && !riotId.trim()) || note.trim().length < 3}
					className="bg-[var(--accent)] rounded-[12px] px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition disabled:cursor-not-allowed disabled:opacity-45"
				>
					Freigeben
				</button>
			</form>

			{message ? (
				<div role="status" className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] px-4 py-3 text-sm font-medium text-[var(--text)]">
					{message}
				</div>
			) : null}

			{entries.length > 0 ? (
				<details
					open={listOpen}
					onToggle={(event) => setListOpen((event.currentTarget as HTMLDetailsElement).open)}
					className="group mt-5 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4"
				>
					<summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text)] marker:hidden">
						<span className="inline-flex items-center gap-2">
							<span className="grid size-6 place-items-center rounded-full border border-[var(--line)] bg-[var(--admin-step)]" aria-hidden="true">
								<span className="size-2 rotate-45 border-b-2 border-r-2 border-[var(--line-strong)] transition-transform duration-200 group-open:-rotate-[135deg]" />
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
										className={`rounded-[12px] border p-4 ${active ? "border-[var(--line)] bg-[var(--admin-step)]" : "border-[var(--line)] bg-[var(--admin-inset)] opacity-55"}`}
									>
										<div className="flex items-center justify-between gap-2">
											<span
												className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${entry.kind === "regular" ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--admin-step)] text-[var(--text)]"}`}
											>
												{entry.kind === "regular" ? "Dauergast" : "Ausnahme"}
											</span>
											{!active ? <span className="text-xs font-semibold text-[var(--muted)]">Abgelaufen</span> : null}
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
											onClick={() => setPendingRemoval(entry)}
											className="mt-3 text-xs font-semibold text-[var(--muted)] underline decoration-[var(--danger)] underline-offset-4 hover:text-[var(--danger)] disabled:opacity-50"
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
			<span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
			<input
				name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
				autoComplete="off"
				spellCheck={false}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				required={required}
				placeholder={placeholder}
				className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2.5 text-sm font-medium text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
			/>
		</label>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[4.5rem_1fr] gap-2">
			<span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
			<span className="break-words font-medium text-[var(--text)]">{children}</span>
		</div>
	);
}
