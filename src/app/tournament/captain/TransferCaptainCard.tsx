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
			<section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
				<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Captain übertragen</div>
				<p className="mt-2 text-sm leading-6 text-emerald-100/58">Aktuell gibt es kein weiteres Teammitglied mit verknüpftem Discord-Account.</p>
			</section>
		);
	}

	return (
		<form onSubmit={submit} className="rounded-[2rem] border border-amber-200/16 bg-amber-300/[0.055] p-5 shadow-xl shadow-black/20">
			<div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/70">Captain übertragen</div>
			<h2 className="mt-2 text-2xl font-black text-emerald-50">Verantwortung an ein Teammitglied abgeben</h2>
			<p className="mt-2 text-sm leading-6 text-emerald-100/58">
				Die Captain-Rolle, das Captain-Portal und alle Draft-Rechte wechseln sofort. Während eines bereits gestarteten Drafts ist die Übergabe gesperrt.
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
						<span className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100/52">Zur Bestätigung „{candidate.name}“ eingeben</span>
						<input
							value={confirmation}
							onChange={(event) => setConfirmation(event.target.value)}
							placeholder={candidate.name}
							className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-emerald-50 outline-none transition focus:border-amber-200/45"
						/>
					</label>
				) : null}
			</div>

			<button
				type="submit"
				disabled={saving || !candidate || confirmation.trim() !== candidate.name}
				className="mt-4 rounded-2xl border border-amber-100/24 bg-amber-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
			>
				{saving ? "Wird übertragen..." : "Captain endgültig übertragen"}
			</button>

			{message ? <p className={`mt-3 text-sm font-bold ${message.tone === "ok" ? "text-lime-100" : "text-amber-100"}`}>{message.text}</p> : null}
			<ConfirmDialog
				open={confirmOpen}
				title="Captain wirklich übertragen?"
				description={
					<>
						Die Rolle wird sofort an <strong className="text-emerald-50">{candidate?.name}</strong> übertragen. Du verlierst dadurch deine Captain- und Draft-Rechte.
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
