"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function WithdrawApplicationButton({ deadlineLabel, onWithdrawn, className = "" }: { deadlineLabel: string; onWithdrawn?: (message: string) => void; className?: string }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	async function withdraw() {
		setOpen(false);
		setBusy(true);
		setError(null);
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 15_000);
		try {
			const response = await fetch("/api/tournament/applications?self=true", { method: "DELETE", signal: controller.signal });
			const result = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) {
				setError(result?.message ?? "Die Bewerbung konnte nicht zurückgezogen werden.");
				return;
			}

			const message = result?.message ?? "Deine Bewerbung wurde zurückgezogen.";
			setSuccess(message);
			onWithdrawn?.(message);
			router.refresh();
		} catch (requestError) {
			setError(
				requestError instanceof DOMException && requestError.name === "AbortError"
					? "Die Anfrage hat zu lange gedauert. Bitte versuche es erneut."
					: "Die Bewerbung konnte wegen eines Netzwerkfehlers nicht zurückgezogen werden."
			);
		} finally {
			window.clearTimeout(timeout);
			setBusy(false);
		}
	}

	return (
		<>
			<div className={`grid gap-2 ${className}`}>
				{success ? (
					<div className="rounded-xl border border-lime-200/24 bg-lime-200/[0.08] px-4 py-3 text-xs font-bold leading-5 text-lime-50">{success}</div>
				) : (
					<button
						type="button"
						disabled={busy}
						onClick={() => setOpen(true)}
						className="inline-flex justify-center rounded-xl border border-rose-300/24 bg-rose-400/[0.08] px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100 transition hover:border-rose-300/45 hover:bg-rose-400/[0.13] disabled:cursor-wait disabled:opacity-55"
					>
						{busy ? "Bewerbung wird zurückgezogen..." : "Bewerbung zurückziehen"}
					</button>
				)}
				{error ? <div className="rounded-xl border border-red-300/24 bg-red-500/10 px-3 py-2 text-xs font-bold leading-5 text-red-100">{error}</div> : null}
			</div>

			<ConfirmDialog
				open={open}
				title="Bewerbung wirklich zurückziehen?"
				description={
					<>
						Deine Turnierbewerbung und deine Wunschgruppe werden entfernt. Deine Discord-, Riot- und Twitch-Verknüpfungen bleiben für spätere Bewerbungen erhalten. Bis
						zum Bewerbungsschluss am <strong className="text-emerald-50">{deadlineLabel}</strong> kannst du dich erneut bewerben.
					</>
				}
				confirmLabel="Ja, zurückziehen"
				cancelLabel="Bewerbung behalten"
				tone="danger"
				onConfirm={() => void withdraw()}
				onCancel={() => setOpen(false)}
			/>
		</>
	);
}
