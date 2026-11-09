"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

type Candidate = {
	discordId: string;
	name: string;
	riotId: string;
	role: string;
};

export function TransferCaptainCard({ teamKey, candidates }: { teamKey: string; candidates: Candidate[] }) {
	const router = useRouter();
	const [targetDiscordId, setTargetDiscordId] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [saving, setSaving] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [message, setMessage] = useState<{
		tone: "ok" | "error";
		text: string;
	} | null>(null);
	const candidate = candidates.find((entry) => entry.discordId === targetDiscordId);

	async function transferCaptain(): Promise<boolean> {
		if (!candidate || confirmation.trim() !== candidate.name) return false;
		setConfirmOpen(false);
		setSaving(true);
		setMessage(null);
		const response = await fetch("/api/tournament/captain/transfer", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				teamKey,
				targetDiscordId: candidate.discordId,
			}),
		});
		const result = (await response.json().catch(() => null)) as { message?: string; warnings?: string[] } | null;
		setSaving(false);

		if (!response.ok) {
			setMessage({
				tone: "error",
				text: result?.message ?? "Captain konnte nicht übertragen werden.",
			});
			return false;
		}

		const warnings = result?.warnings ?? [];
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text: warnings.length > 0 ? `Captain übertragen. Discord-Warnung: ${warnings.join(" ")}` : `Captain wurde an ${candidate.name} übertragen.`,
		});
		setTargetDiscordId("");
		setConfirmation("");
		router.refresh();
		return true;
	}

	useUnsavedChanges({
		dirty: Boolean(targetDiscordId || confirmation),
		label: "Captain-Übergabe",
		save: transferCaptain,
	});

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!candidate || confirmation.trim() !== candidate.name) return;
		setConfirmOpen(true);
	}

	if (candidates.length === 0) {
		return (
			<section className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-5">
				<h2 className="text-lg font-semibold text-[var(--text)]">Captain übertragen</h2>
				<p className="mt-1 text-sm leading-6 text-[var(--muted)]">Kein weiteres Teammitglied hat einen verknüpften Discord-Account.</p>
			</section>
		);
	}

	return (
		<form onSubmit={submit} className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-5">
			<h2 className="text-lg font-semibold text-[var(--text)]">Captain übertragen</h2>
			<p className="mt-1 text-sm leading-6 text-[var(--muted)]">
				Captain-Rolle, Portal und Draft-Rechte wechseln sofort. Während eines laufenden Drafts ist die Übergabe gesperrt.
			</p>

			<div className="mt-4 grid gap-3">
				<ThemedSelect
					value={targetDiscordId}
					onChange={setTargetDiscordId}
					options={[
						{ value: "", label: "Teammitglied auswählen" },
						...candidates.map((entry) => ({
							value: entry.discordId,
							label: `${entry.name} · ${entry.role} · ${entry.riotId}`,
						})),
					]}
				/>
				{candidate ? (
					<label className="grid gap-2">
						<span className="text-sm text-[var(--muted)]">Zur Bestätigung „{candidate.name}“ eingeben</span>
						<input
							name="captain-confirmation"
							autoComplete="off"
							spellCheck={false}
							value={confirmation}
							onChange={(event) => setConfirmation(event.target.value)}
							placeholder={`${candidate.name}…`}
							className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
						/>
					</label>
				) : null}
			</div>

			<button
				type="submit"
				disabled={saving || !candidate || confirmation.trim() !== candidate.name}
				className="mt-4 rounded-[10px] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] px-5 py-2.5 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
			>
				{saving ? "Wird übertragen…" : "Captain endgültig übertragen"}
			</button>

			{message ? (
<p role="status" className={`mt-3 text-sm ${message.tone === "ok" ? "text-[var(--accent)]" : "text-[var(--amber)]"}`}>
					{message.text}
				</p>
			) : null}
			<ConfirmDialog
				open={confirmOpen}
				title="Captain wirklich übertragen?"
				description={
					<>
						Die Rolle wird sofort an <strong className="font-semibold text-[var(--text)]">{candidate?.name}</strong> übertragen. Du verlierst dadurch deine Captain- und Draft-Rechte.
					</>
				}
				confirmLabel="Captain übertragen"
				cancelLabel="Abbrechen"
				tone="danger"
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => void transferCaptain()}
			/>
		</form>
	);
}
