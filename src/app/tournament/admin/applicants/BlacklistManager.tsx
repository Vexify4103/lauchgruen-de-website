"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { TournamentBlacklistEntry } from "@/lib/tournament-storage";
import type { PartnerReport } from "@/lib/partner-api";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type SaveResponse = { message?: string; version?: number; entry?: TournamentBlacklistEntry | null; alreadyBanned?: boolean } | null;

export function BlacklistManager({
	initialEntries,
	initialVersion,
	initialReports,
}: {
	initialEntries: TournamentBlacklistEntry[];
	initialVersion: number;
	initialReports: PartnerReport[];
}) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [entries, setEntries] = useState(initialEntries);
	const [reports, setReports] = useState(initialReports);
	const [listOpen, setListOpen] = useState(false);
	const [message, setMessage] = useState("");
	const [discordId, setDiscordId] = useState("");
	const [riotId, setRiotId] = useState("");
	const [reason, setReason] = useState("");
	const [shared, setShared] = useState(false);
	const [publicReason, setPublicReason] = useState("");
	const [sharingId, setSharingId] = useState<string | null>(null);
	const [sharingReason, setSharingReason] = useState("");
	const [pendingRemoval, setPendingRemoval] = useState<TournamentBlacklistEntry | null>(null);
	const [isPending, startTransition] = useTransition();

	/** Sends one admin request and handles version conflicts and errors the same way everywhere. */
	async function send(url: string, init: RequestInit, failure: string): Promise<SaveResponse | false> {
		setMessage("");
		const response = await fetch(url, init);
		const json = (await response.json().catch(() => null)) as SaveResponse;
		if (json?.version !== undefined) setVersion(json.version);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage(json?.message ?? failure);
			return false;
		}
		return json;
	}

	function upsertEntry(entry: TournamentBlacklistEntry) {
		setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
	}

	async function persistEntry(): Promise<boolean> {
		const json = await send(
			"/api/tournament/blacklist",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					discordId: discordId.trim() || undefined,
					riotId: riotId.trim() || undefined,
					reason: reason.trim(),
					// Unchecked means "don't change": re-banning a shared player keeps the sharing. Unshare via the entry card.
					shared: shared || undefined,
					publicReason: shared ? publicReason.trim() || undefined : undefined,
					expectedVersion: version,
				}),
			},
			"Blacklist-Eintrag konnte nicht gespeichert werden."
		);
		if (!json) return false;
		if (json.entry) {
			upsertEntry(json.entry);
			setListOpen(true);
		}
		setDiscordId("");
		setRiotId("");
		setReason("");
		setShared(false);
		setPublicReason("");
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
		startTransition(async () => {
			const json = await send(
				`/api/tournament/blacklist?id=${encodeURIComponent(id)}&expectedVersion=${version}`,
				{ method: "DELETE" },
				"Blacklist-Eintrag konnte nicht entfernt werden."
			);
			if (json === false) return;
			setEntries((current) => current.filter((entry) => entry.id !== id));
			setMessage("Blacklist-Eintrag entfernt.");
			router.refresh();
		});
	}

	function setSharing(entry: TournamentBlacklistEntry, nextShared: boolean, nextReason?: string) {
		startTransition(async () => {
			const json = await send(
				"/api/tournament/blacklist",
				{
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id: entry.id, shared: nextShared, publicReason: nextShared ? nextReason?.trim() || undefined : undefined, expectedVersion: version }),
				},
				"Freigabe konnte nicht gespeichert werden."
			);
			if (json === false) return;
			if (json?.entry) upsertEntry(json.entry);
			setSharingId(null);
			setSharingReason("");
			setMessage(nextShared ? "Eintrag wird mit Partnern geteilt." : "Eintrag wird nicht mehr geteilt.");
		});
	}

	function decide(report: PartnerReport, accept: boolean, options: { shared: boolean; publicReason: string }) {
		startTransition(async () => {
			const json = await send(
				"/api/tournament/partner-api/reports",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						id: report.id,
						accept,
						shared: accept ? options.shared : undefined,
						publicReason: accept && options.shared ? options.publicReason.trim() || undefined : undefined,
						expectedVersion: version,
					}),
				},
				"Meldung konnte nicht bearbeitet werden."
			);
			if (json === false) return;
			setReports((current) => current.filter((item) => item.id !== report.id));
			if (json?.entry) upsertEntry(json.entry);
			setMessage(!accept ? "Meldung abgelehnt." : json?.alreadyBanned ? "Spieler war schon gesperrt, Meldung wurde ergänzt." : "Meldung angenommen, Spieler gesperrt.");
			router.refresh();
		});
	}

	const sharedCount = entries.filter((entry) => entry.shared).length;

	return (
		<section className="mt-8 rounded-[16px] border border-[var(--line)] bg-[var(--admin-surface)] p-5">
			<ConfirmDialog
				open={Boolean(pendingRemoval)}
				tone="danger"
				title="Blacklist-Eintrag entfernen?"
				description="Die Person kann sich danach wieder für Turniere bewerben. Partner sehen den Eintrag bei ihrem nächsten Abruf nicht mehr."
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
						Blockiert Bewerbungen, wenn Discord-ID oder Riot-ID übereinstimmt. Die Sperre ist dauerhaft, bis sie hier aktiv entfernt wird. Geteilte Einträge sehen
						Partner über die Partner-API, mit dem öffentlichen Grund statt dem internen.
					</p>
				</div>
				<div className="font-mono text-[13px] tabular-nums text-[var(--muted)]">
					{entries.length} Einträge · {sharedCount} geteilt
				</div>
			</div>

			<form onSubmit={addEntry} className="mt-5 grid gap-3">
				<div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
					<Field label="Discord-ID" value={discordId} onChange={setDiscordId} placeholder="337568120028004362…" />
					<Field label="Riot-ID" value={riotId} onChange={setRiotId} placeholder="Name#TAG…" />
					<Field label="Grund (intern)" value={reason} onChange={setReason} placeholder="Regelbruch, Toxicity, No-show…" required />
					<button
						type="submit"
						disabled={isPending}
						className="rounded-[12px] bg-[var(--danger)] px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition disabled:opacity-60"
					>
						Sperren
					</button>
				</div>
				<div className="grid gap-3 lg:grid-cols-[auto_1fr] lg:items-end">
					<label className="flex items-center gap-2 py-2.5 text-sm font-medium text-[var(--text)]">
						<input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} className="size-4 accent-[var(--accent)]" />
						Mit Partnern teilen
					</label>
					{shared ? (
						<Field label="Öffentlicher Grund" value={publicReason} onChange={setPublicReason} placeholder="z. B. Unsportliches Verhalten…" maxLength={120} />
					) : null}
				</div>
			</form>

			{message ? (
				<div role="status" className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] px-4 py-3 text-sm font-medium text-[var(--text)]">
					{message}
				</div>
			) : null}

			{reports.length > 0 ? (
				<div className="mt-5 rounded-[12px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[var(--admin-inset)] p-4">
					<h3 className="text-sm font-semibold text-[var(--text)]">Meldungen von Partnern ({reports.length})</h3>
					<p className="mt-1 text-xs leading-5 text-[var(--muted)]">Partner können Spieler nur vorschlagen. Gesperrt wird erst, wenn du annimmst.</p>
					<div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{reports.map((report) => (
							<ReportCard key={report.id} report={report} disabled={isPending} onDecide={(accept, options) => decide(report, accept, options)} />
						))}
					</div>
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
					<div className="mt-4 max-h-96 overflow-y-auto pr-1">
						<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							{entries.map((entry) => (
								<article key={entry.id} className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
									<div className="grid gap-1 text-sm">
										<Row label="Discord">{entry.discordId ?? "—"}</Row>
										<Row label="Riot">{entry.riotId ?? "—"}</Row>
										<Row label="Grund">{entry.reason}</Row>
										<Row label="Partner">{entry.shared ? `Geteilt · ${entry.publicReason || "Gesperrt"}` : "Nicht geteilt"}</Row>
									</div>
									{sharingId === entry.id ? (
										<div className="mt-3 grid gap-2">
											<Field
												label="Öffentlicher Grund"
												value={sharingReason}
												onChange={setSharingReason}
												placeholder="z. B. Unsportliches Verhalten…"
												maxLength={120}
											/>
											<div className="flex gap-3">
												<button
													type="button"
													disabled={isPending}
													onClick={() => setSharing(entry, true, sharingReason)}
													className="text-xs font-semibold text-[var(--accent)]"
												>
													Teilen
												</button>
												<button type="button" onClick={() => setSharingId(null)} className="text-xs font-semibold text-[var(--muted)]">
													Abbrechen
												</button>
											</div>
										</div>
									) : (
										<div className="mt-3 flex flex-wrap gap-4">
											<button
												type="button"
												disabled={isPending}
												onClick={() => {
													if (entry.shared) setSharing(entry, false);
													else {
														setSharingId(entry.id);
														setSharingReason(entry.publicReason ?? "");
													}
												}}
												className="text-xs font-semibold text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--text)]"
											>
												{entry.shared ? "Nicht mehr teilen" : "Mit Partnern teilen"}
											</button>
											<button
												type="button"
												disabled={isPending}
												onClick={() => setPendingRemoval(entry)}
												className="text-xs font-semibold text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--danger)]"
											>
												Entfernen
											</button>
										</div>
									)}
								</article>
							))}
						</div>
					</div>
				</details>
			) : null}
		</section>
	);
}

function ReportCard({
	report,
	disabled,
	onDecide,
}: {
	report: PartnerReport;
	disabled: boolean;
	onDecide: (accept: boolean, options: { shared: boolean; publicReason: string }) => void;
}) {
	const [shared, setShared] = useState(false);
	const [publicReason, setPublicReason] = useState("");
	return (
		<article className="grid gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--admin-step)] p-4 text-sm">
			<Row label="Partner">{report.partnerName}</Row>
			<Row label="Discord">{report.discordId ?? "—"}</Row>
			<Row label="Riot">{report.riotId ?? "—"}</Row>
			<Row label="Grund">{report.reason}</Row>
			{report.evidenceUrl ? (
				<Row label="Beleg">
					<a href={report.evidenceUrl} target="_blank" rel="noreferrer noopener" className="text-[var(--accent)] underline underline-offset-4">
						Link öffnen
					</a>
				</Row>
			) : null}
			<Row label="Eingang">{new Date(report.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })}</Row>
			<label className="mt-1 flex items-center gap-2 text-xs font-medium text-[var(--text)]">
				<input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} className="size-4 accent-[var(--accent)]" />
				Bei Annahme mit Partnern teilen
			</label>
			{shared ? <Field label="Öffentlicher Grund" value={publicReason} onChange={setPublicReason} placeholder="z. B. Unsportliches Verhalten…" maxLength={120} /> : null}
			<div className="mt-1 flex gap-2">
				<button
					type="button"
					disabled={disabled}
					onClick={() => onDecide(true, { shared, publicReason })}
					className="rounded-[10px] bg-[var(--danger)] px-3 py-2 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-60"
				>
					Annehmen und sperren
				</button>
				<button
					type="button"
					disabled={disabled}
					onClick={() => onDecide(false, { shared: false, publicReason: "" })}
					className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)] disabled:opacity-60"
				>
					Ablehnen
				</button>
			</div>
		</article>
	);
}

function Field({
	label,
	value,
	onChange,
	placeholder,
	required,
	maxLength,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	required?: boolean;
	maxLength?: number;
}) {
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
				maxLength={maxLength}
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
