"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { TournamentBlacklistEntry } from "@/lib/tournament-storage";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function BlacklistManager({ initialEntries, initialVersion }: { initialEntries: TournamentBlacklistEntry[]; initialVersion: number }) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [entries, setEntries] = useState(initialEntries);
	const [listOpen, setListOpen] = useState(false);
	const [message, setMessage] = useState("");
	const [discordId, setDiscordId] = useState("");
	const [riotId, setRiotId] = useState("");
	const [reason, setReason] = useState("");
	const [pendingRemoval, setPendingRemoval] = useState<TournamentBlacklistEntry | null>(null);
	const [isPending, startTransition] = useTransition();

	async function persistEntry(): Promise<boolean> {
		setMessage("");
		const response = await fetch("/api/tournament/blacklist", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				discordId: discordId.trim() || undefined,
				riotId: riotId.trim() || undefined,
				reason: reason.trim(),
				expectedVersion: version,
			}),
		});
		const json = (await response.json().catch(() => null)) as { message?: string; version?: number; entry?: TournamentBlacklistEntry } | null;
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage(json?.message ?? "Blacklist-Eintrag konnte nicht gespeichert werden.");
			return false;
		}
		if (json?.version !== undefined) setVersion(json.version);
		if (json?.entry) {
			setEntries((current) => [json.entry!, ...current.filter((entry) => entry.id !== json.entry!.id)]);
			setListOpen(true);
		}
		setDiscordId("");
		setRiotId("");
		setReason("");
		setMessage("Blacklist-Eintrag gespeichert.");
		router.refresh();
		return true;
	}

	useUnsavedChanges({
		dirty: Boolean(discordId.trim() || riotId.trim() || reason.trim()),
		label: "Blacklist-Eintrag",
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
			const response = await fetch(`/api/tournament/blacklist?id=${encodeURIComponent(id)}&expectedVersion=${version}`, {
				method: "DELETE",
			});
			const json = (await response.json().catch(() => null)) as { message?: string; version?: number } | null;
			if (!response.ok) {
				if (isAdminVersionConflict(response, json)) {
					showConflict(json);
					return;
				}
				setMessage(json?.message ?? "Blacklist-Eintrag konnte nicht entfernt werden.");
				return;
			}
			if (json?.version !== undefined) setVersion(json.version);
			setEntries((current) => current.filter((entry) => entry.id !== id));
			setMessage("Blacklist-Eintrag entfernt.");
			router.refresh();
		});
	}

	return (
		<section className="mt-8 rounded-[16px] border border-[var(--line)] bg-[var(--admin-surface)] p-5">
			<ConfirmDialog
				open={Boolean(pendingRemoval)}
				tone="danger"
				title="Blacklist-Eintrag entfernen?"
				description="Die Person kann sich danach wieder für Turniere bewerben."
				confirmLabel="Eintrag entfernen"
				cancelLabel="Abbrechen"
				onConfirm={() => {
					if (pendingRemoval) removeEntry(pendingRemoval.id);
					setPendingRemoval(null);
				}}
				onCancel={() => setPendingRemoval(null)}
			/>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<div className="text-xs font-semibold text-[var(--danger)]">Blacklist</div>
					<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Spieler für zukünftige Turniere sperren</h2>
					<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
						Blockiert Bewerbungen, wenn Discord-ID oder Riot-ID übereinstimmt. Die Sperre ist dauerhaft, bis sie hier aktiv entfernt wird.
					</p>
				</div>
				<div className="font-mono text-[13px] tabular-nums text-[var(--muted)]">{entries.length} Einträge</div>
			</div>

			<form onSubmit={addEntry} className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
				<Field label="Discord-ID" value={discordId} onChange={setDiscordId} placeholder="337568120028004362…" />
				<Field label="Riot-ID" value={riotId} onChange={setRiotId} placeholder="Name#TAG…" />
				<Field label="Grund" value={reason} onChange={setReason} placeholder="Regelbruch, Toxicity, No-show…" required />
				<button
					type="submit"
					disabled={isPending}
					className="rounded-[12px] bg-[var(--danger)] px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition disabled:opacity-60"
				>
					Sperren
				</button>
			</form>

			{message ? (
				<div role="status" className="mt-4 rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--admin-inset)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
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
								<span className="size-2 rotate-45 border-b-2 border-r-2 border-[var(--line)] transition-transform duration-200 group-open:-rotate-[135deg]" />
							</span>
							Aktive Sperren anzeigen ({entries.length})
						</span>
					</summary>
					<div className="mt-4 max-h-80 overflow-y-auto pr-1">
						<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							{entries.map((entry) => (
								<article key={entry.id} className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
									<div className="grid gap-1 text-sm">
										<Row label="Discord">{entry.discordId ?? "—"}</Row>
										<Row label="Riot">{entry.riotId ?? "—"}</Row>
										<Row label="Grund">{entry.reason}</Row>
									</div>
									<button
										type="button"
										disabled={isPending}
										onClick={() => setPendingRemoval(entry)}
										className="mt-3 text-xs font-semibold text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--danger)]"
									>
										Entfernen
									</button>
								</article>
							))}
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
