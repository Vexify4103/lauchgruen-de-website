"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type CaptainRoleStatus = {
	teamName: string;
	captainLabel: string;
	discordId: string;
	status: "missing-config" | "missing-member" | "missing-role" | "synced" | "error";
	message: string;
};

const tone: Record<CaptainRoleStatus["status"], string> = {
	synced: "border-lime-200/20 bg-lime-200/10 text-lime-50",
	"missing-role": "border-amber-200/22 bg-amber-200/10 text-amber-50",
	"missing-member": "border-red-300/22 bg-red-500/10 text-red-100",
	"missing-config": "border-amber-200/22 bg-amber-200/10 text-amber-50",
	error: "border-red-300/22 bg-red-500/10 text-red-100",
};

export function DiscordSyncPanel({ statuses }: { statuses: CaptainRoleStatus[] }) {
	const router = useRouter();
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const synced = statuses.filter((entry) => entry.status === "synced").length;

	function repair() {
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/discord-sync", { method: "POST" });
			const json = (await response.json().catch(() => null)) as {
				message?: string;
				results?: Array<{
					discordId: string;
					after: { status: CaptainRoleStatus["status"]; message: string };
				}>;
			} | null;
			if (!response.ok) {
				setMessage(json?.message ?? "Discord Sync fehlgeschlagen.");
				return;
			}
			const results = json?.results ?? [];
			const syncedAfterRepair = results.filter((entry) => entry.after.status === "synced").length;
			const failed = results.filter((entry) => entry.after.status !== "synced");
			const failedPreview = failed
				.slice(0, 3)
				.map((entry) => `${entry.discordId}: ${entry.after.message}`)
				.join(" ");
			setMessage(
				failed.length > 0
					? `Captain-Rollen Repair ausgeführt: ${syncedAfterRepair}/${results.length} synchronisiert. ${failedPreview}`
					: `Captain-Rollen Repair ausgeführt: ${syncedAfterRepair}/${results.length} synchronisiert.`
			);
			router.refresh();
		});
	}

	return (
		<section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Discord Sync</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Captain-Rollen</h2>
					<p className="mt-2 text-sm leading-6 text-emerald-100/58">Zeigt sofort, ob ein Captain seine Discord-Rolle hat oder ob der Bot gerade nicht reparieren kann.</p>
				</div>
				<button
					type="button"
					disabled={isPending}
					onClick={repair}
					className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-xl shadow-lime-300/20 disabled:opacity-50"
				>
					Rollen reparieren
				</button>
			</div>
			<div className="mt-4 rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm font-black text-lime-100">
				{synced}/{statuses.length} Captain-Rollen synced
			</div>
			<div className="mt-4 grid gap-2 md:grid-cols-2">
				{statuses.map((entry) => (
					<div key={`${entry.teamName}-${entry.discordId}`} className={`rounded-2xl border p-3 ${tone[entry.status]}`}>
						<div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{entry.teamName}</div>
						<div className="mt-1 text-sm font-black">{entry.captainLabel}</div>
						<div className="mt-1 text-xs opacity-70">{entry.message}</div>
					</div>
				))}
			</div>
			{message ? <div className="mt-4 rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">{message}</div> : null}
		</section>
	);
}
