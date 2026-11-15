"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { PartnerApiKey } from "@/lib/partner-api-store";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";

function formatDate(iso?: string) {
	if (!iso) return "—";
	return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
}

/** Owner panel for partner API keys: create (key shown once), list, revoke. */
export function PartnerApiManager({ initialKeys, initialVersion }: { initialKeys: PartnerApiKey[]; initialVersion: number }) {
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [keys, setKeys] = useState(initialKeys);
	const [partnerName, setPartnerName] = useState("");
	const [newKey, setNewKey] = useState<{ key: string; partnerName: string } | null>(null);
	const [copied, setCopied] = useState(false);
	const [message, setMessage] = useState("");
	const [pendingRevoke, setPendingRevoke] = useState<PartnerApiKey | null>(null);
	const [isPending, startTransition] = useTransition();

	async function send(url: string, init: RequestInit, failure: string) {
		setMessage("");
		const response = await fetch(url, init);
		const json = (await response.json().catch(() => null)) as { message?: string; version?: number; key?: string; apiKey?: PartnerApiKey } | null;
		if (json?.version !== undefined) setVersion(json.version);
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) showConflict(json);
			else setMessage(json?.message ?? failure);
			return null;
		}
		return json;
	}

	function createKey(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		startTransition(async () => {
			const json = await send(
				"/api/tournament/partner-api/keys",
				{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partnerName: partnerName.trim(), expectedVersion: version }) },
				"Key konnte nicht erstellt werden."
			);
			if (!json?.key || !json.apiKey) return;
			const apiKey = json.apiKey;
			setKeys((current) => [apiKey, ...current]);
			setNewKey({ key: json.key, partnerName: apiKey.partnerName });
			setCopied(false);
			setPartnerName("");
		});
	}

	function revokeKey(id: string) {
		startTransition(async () => {
			const json = await send(
				`/api/tournament/partner-api/keys?id=${encodeURIComponent(id)}&expectedVersion=${version}`,
				{ method: "DELETE" },
				"Key konnte nicht gesperrt werden."
			);
			if (!json?.apiKey) return;
			const apiKey = json.apiKey;
			setKeys((current) => current.map((key) => (key.id === id ? apiKey : key)));
			setMessage(`Key für ${apiKey.partnerName} gesperrt.`);
		});
	}

	async function copyKey() {
		if (!newKey) return;
		await navigator.clipboard.writeText(newKey.key);
		setCopied(true);
	}

	return (
		<section className="mt-8 rounded-[16px] border border-[var(--line)] bg-[var(--admin-surface)] p-5" aria-labelledby="partner-api-title">
			<ConfirmDialog
				open={Boolean(pendingRevoke)}
				tone="danger"
				title="API-Key sperren?"
				description={`${pendingRevoke?.partnerName ?? "Der Partner"} kann danach weder die Blacklist abrufen noch Spieler melden. Das lässt sich nicht rückgängig machen; erstelle bei Bedarf einen neuen Key.`}
				confirmLabel="Key sperren"
				cancelLabel="Abbrechen"
				onConfirm={() => {
					if (pendingRevoke) revokeKey(pendingRevoke.id);
					setPendingRevoke(null);
				}}
				onCancel={() => setPendingRevoke(null)}
			/>
			<div className="text-xs font-semibold text-[var(--muted)]">Partner-API</div>
			<h2 id="partner-api-title" className="mt-2 text-2xl font-semibold text-[var(--text)]">
				API-Keys für Partner
			</h2>
			<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
				Partner rufen geteilte Sperren über <code className="font-mono text-[13px]">https://tournament.lauchgruen.de/api/v1/blacklist</code> ab und können Spieler zur
				Prüfung melden. Jeder Partner bekommt einen eigenen Key.
			</p>

			<form onSubmit={createKey} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
				<label className="grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Partner</span>
					<input
						name="partner-name"
						autoComplete="off"
						value={partnerName}
						onChange={(event) => setPartnerName(event.target.value)}
						required
						minLength={2}
						maxLength={80}
						placeholder="Name des Creators oder Turniers…"
						className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2.5 text-sm font-medium text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
					/>
				</label>
				<button
					type="submit"
					disabled={isPending}
					className="rounded-[12px] bg-[var(--accent)] px-5 py-3 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-60"
				>
					Key erstellen
				</button>
			</form>

			{newKey ? (
				<div role="status" className="mt-4 grid gap-2 rounded-[12px] border border-[var(--accent)] bg-[var(--admin-inset)] p-4">
					<p className="text-sm font-semibold text-[var(--text)]">Key für {newKey.partnerName}. Wird nur jetzt angezeigt.</p>
					<code className="break-all rounded-lg border border-[var(--line)] bg-[var(--admin-step)] px-3 py-2 font-mono text-[13px] text-[var(--text)]">{newKey.key}</code>
					<div className="flex gap-4">
						<button type="button" onClick={copyKey} className="text-xs font-semibold text-[var(--accent)]">
							{copied ? "Kopiert" : "Kopieren"}
						</button>
						<button type="button" onClick={() => setNewKey(null)} className="text-xs font-semibold text-[var(--muted)]">
							Ausblenden
						</button>
					</div>
					<p className="text-xs leading-5 text-[var(--muted)]">Schick den Key privat (DM), nie in einen öffentlichen Channel.</p>
				</div>
			) : null}

			{message ? (
				<div role="status" className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] px-4 py-3 text-sm font-medium text-[var(--text)]">
					{message}
				</div>
			) : null}

			{keys.length > 0 ? (
				<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{keys.map((key) => (
						<article key={key.id} className="grid gap-1 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4 text-sm">
							<div className="flex items-center justify-between gap-2">
								<strong className="truncate text-[var(--text)]">{key.partnerName}</strong>
								<span className="font-mono text-xs text-[var(--muted)]">{key.prefix}…</span>
							</div>
							<span className="text-xs text-[var(--muted)]">Erstellt {formatDate(key.createdAt)}</span>
							<span className="text-xs text-[var(--muted)]">Zuletzt benutzt {formatDate(key.lastUsedAt)}</span>
							{key.revokedAt ? (
								<span className="text-xs font-semibold text-[var(--danger)]">Gesperrt {formatDate(key.revokedAt)}</span>
							) : (
								<button
									type="button"
									disabled={isPending}
									onClick={() => setPendingRevoke(key)}
									className="mt-2 justify-self-start text-xs font-semibold text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--danger)]"
								>
									Key sperren
								</button>
							)}
						</article>
					))}
				</div>
			) : null}
		</section>
	);
}
