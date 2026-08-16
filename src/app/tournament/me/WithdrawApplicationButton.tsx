"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function WithdrawApplicationButton({
	deadlineLabel,
	onWithdrawn,
	className = "",
}: {
	deadlineLabel: string;
	onWithdrawn?: (message: string) => void;
	className?: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function withdraw() {
		setOpen(false);
		setBusy(true);
		setError(null);
		const response = await fetch("/api/tournament/applications?self=true", { method: "DELETE" });
		const result = (await response.json().catch(() => null)) as { message?: string } | null;
		setBusy(false);
		if (!response.ok) {
			setError(result?.message ?? "Die Bewerbung konnte nicht zurückgezogen werden.");
			return;
		}

		onWithdrawn?.(result?.message ?? "Deine Bewerbung wurde zurückgezogen.");
		router.refresh();
	}

	return (
		<>
			<div className={`grid gap-2 ${className}`}>
				<button
					type="button"
					disabled={busy}
					onClick={() => setOpen(true)}
					className="inline-flex justify-center rounded-xl border border-rose-300/24 bg-rose-400/[0.08] px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100 transition hover:border-rose-300/45 hover:bg-rose-400/[0.13] disabled:cursor-wait disabled:opacity-55"
				>
					{busy ? "Bewerbung wird zurückgezogen..." : "Bewerbung zurückziehen"}
				</button>
				{error ? <div className="rounded-xl border border-red-300/24 bg-red-500/10 px-3 py-2 text-xs font-bold leading-5 text-red-100">{error}</div> : null}
			</div>

			<ConfirmDialog
				open={open}
				title="Bewerbung wirklich zurückziehen?"
				description={
					<>
						Deine Turnierbewerbung und dein Wunschduo werden entfernt. Deine Discord-, Riot- und Twitch-Verknüpfungen bleiben für spätere Bewerbungen erhalten. Bis zum Bewerbungsschluss am{" "}
						<strong className="text-emerald-50">{deadlineLabel}</strong> kannst du dich erneut bewerben.
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
