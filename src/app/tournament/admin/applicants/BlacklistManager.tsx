"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { TournamentBlacklistEntry } from "@/lib/tournament-storage";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";

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
		<section className="mt-8 rounded-[2rem] border border-red-300/18 bg-red-500/[0.045] p-5 shadow-xl shadow-black/20">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-red-100/70">Blacklist</div>
					<h2 className="mt-2 text-2xl font-black text-red-50">Spieler für zukünftige Turniere sperren</h2>
					<p className="mt-2 text-sm leading-6 text-red-50/62">
						Blockiert Bewerbungen, wenn Discord-ID oder Riot-ID übereinstimmt. Die Sperre ist dauerhaft, bis sie hier aktiv entfernt wird.
					</p>
				</div>
				<div className="rounded-2xl border border-red-200/18 bg-black/20 px-4 py-2 text-sm font-black text-red-50">{entries.length} Einträge</div>
			</div>

			<form onSubmit={addEntry} className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
				<Field label="Discord-ID" value={discordId} onChange={setDiscordId} placeholder="337568120028004362" />
				<Field label="Riot-ID" value={riotId} onChange={setRiotId} placeholder="Name#TAG" />
				<Field label="Grund" value={reason} onChange={setReason} placeholder="Regelbruch, Toxicity, No-show..." required />
				<button
					type="submit"
					disabled={isPending}
					className="rounded-2xl bg-red-100 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-red-950 transition hover:-translate-y-0.5 disabled:opacity-60"
				>
					Sperren
				</button>
			</form>

			{message ? <div className="mt-4 rounded-2xl border border-red-200/20 bg-black/24 px-4 py-3 text-sm font-bold text-red-50">{message}</div> : null}

			{entries.length > 0 ? (
				<details
					open={listOpen}
					onToggle={(event) => setListOpen((event.currentTarget as HTMLDetailsElement).open)}
					className="group mt-5 rounded-2xl border border-red-200/14 bg-black/16 p-4"
				>
					<summary className="cursor-pointer list-none text-sm font-black text-red-50 marker:hidden">
						<span className="inline-flex items-center gap-2">
							<span className="grid size-6 place-items-center rounded-full border border-red-200/18 bg-red-100/8" aria-hidden="true">
								<span className="size-2 rotate-45 border-b-2 border-r-2 border-red-100/72 transition-transform duration-200 group-open:-rotate-[135deg]" />
							</span>
							Aktive Sperren anzeigen ({entries.length})
						</span>
					</summary>
					<div className="mt-4 max-h-80 overflow-y-auto pr-1">
						<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							{entries.map((entry) => (
								<article key={entry.id} className="rounded-2xl border border-red-200/14 bg-black/20 p-4">
									<div className="grid gap-1 text-sm">
										<Row label="Discord">{entry.discordId ?? "—"}</Row>
										<Row label="Riot">{entry.riotId ?? "—"}</Row>
										<Row label="Grund">{entry.reason}</Row>
									</div>
									<button
										type="button"
										disabled={isPending}
										onClick={() => removeEntry(entry.id)}
										className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-red-100/72 underline decoration-red-200/30 underline-offset-4 hover:text-red-50"
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
			<span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-100/64">{label}</span>
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				required={required}
				placeholder={placeholder}
				className="rounded-xl border border-red-200/12 bg-black/24 px-3 py-2.5 text-sm font-bold text-red-50 outline-none placeholder:text-red-100/26 focus:border-red-200/38"
			/>
		</label>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[4.5rem_1fr] gap-2">
			<span className="text-[10px] font-black uppercase tracking-[0.18em] text-red-100/48">{label}</span>
			<span className="break-words font-bold text-red-50/82">{children}</span>
		</div>
	);
}
