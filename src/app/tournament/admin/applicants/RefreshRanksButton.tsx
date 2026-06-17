"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type ApplicationSummary = {
	id?: string;
	displayName?: string;
	riotId?: string;
};

type BulkApplicant = {
	id: string;
	label: string;
};

export function RefreshRanksButton({
	applicationId,
	label = "Rang aktualisieren",
	confirmBulk = false,
	totalCount = 1,
	applicantNames = [],
	estimatedDelayMs = 2600,
}: {
	applicationId?: string;
	label?: string;
	confirmBulk?: boolean;
	totalCount?: number;
	applicantNames?: string[];
	estimatedDelayMs?: number;
}) {
	const router = useRouter();
	const [message, setMessage] = useState("");
	const [progressIndex, setProgressIndex] = useState(0);
	const [runtimeNames, setRuntimeNames] = useState<string[]>([]);
	const [runtimeApplicants, setRuntimeApplicants] = useState<BulkApplicant[]>([]);
	const [runtimeTotal, setRuntimeTotal] = useState(0);
	const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const names = applicantNames.length > 0 ? applicantNames : runtimeNames;
	const effectiveTotal = Math.max(1, names.length || runtimeTotal || totalCount);
	const currentName = names[Math.min(progressIndex, Math.max(0, names.length - 1))];

	useEffect(() => {
		if (!confirmBulk || applicantNames.length > 0 || runtimeNames.length > 0) return;
		let cancelled = false;

		void fetchApplications().then((loaded) => {
			if (cancelled || loaded.length === 0) return;
			setRuntimeApplicants(loaded);
			setRuntimeNames(loaded.map((applicant) => applicant.label));
			setRuntimeTotal(loaded.length);
		});

		return () => {
			cancelled = true;
		};
	}, [applicantNames.length, confirmBulk, runtimeNames.length]);

	async function ensureBulkNames() {
		if (!confirmBulk) return;
		if (names.length > 0) {
			setRuntimeTotal(names.length);
			return;
		}

		const loaded = await fetchApplications();
		if (loaded.length === 0) return;
		setRuntimeApplicants(loaded);
		setRuntimeNames(loaded.map((applicant) => applicant.label));
		setRuntimeTotal(loaded.length);
	}

	async function refreshOne(id?: string) {
		const response = await fetch("/api/tournament/ranks", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(id ? { id } : {}),
		});
		const json = (await response.json().catch(() => null)) as {
			okCount?: number;
			failCount?: number;
			message?: string;
			results?: Array<{ message?: string }>;
		} | null;
		return { response, json };
	}

	async function refreshRanks() {
		setBulkConfirmOpen(false);
		setMessage("");
		setProgressIndex(0);
		await ensureBulkNames();

		startTransition(async () => {
			if (!confirmBulk) {
				try {
					const { response, json } = await refreshOne(applicationId);
					if (!response.ok && response.status !== 429) {
						setMessage(json?.message ?? "Rank-Refresh fehlgeschlagen.");
						return;
					}
					const ok = json?.okCount ?? 0;
					const failed = json?.failCount ?? 0;
					setMessage(failed > 0 ? `${ok} ok, ${failed} Fehler.` : `${ok} aktualisiert.`);
					router.refresh();
				} catch {
					setMessage("Netzwerkfehler beim Rank-Refresh. Bitte erneut versuchen.");
				}
				return;
			}

			const applicants = runtimeApplicants.length > 0 ? runtimeApplicants : await fetchApplications();
			if (applicants.length === 0) {
				setMessage("Keine Bewerbungen zum Aktualisieren gefunden.");
				return;
			}

			setRuntimeApplicants(applicants);
			setRuntimeNames(applicants.map((applicant) => applicant.label));
			setRuntimeTotal(applicants.length);

			let okCount = 0;
			const failed: string[] = [];
			for (let index = 0; index < applicants.length; index += 1) {
				const applicant = applicants[index];
				setProgressIndex(index);
				try {
					const { response, json } = await refreshOne(applicant.id);
					if (response.ok && (json?.failCount ?? 0) === 0) {
						okCount += json?.okCount ?? 1;
					} else {
						const detail = json?.results?.[0]?.message ?? json?.message ?? `HTTP ${response.status}`;
						failed.push(`${applicant.label}: ${detail}`);
					}
				} catch {
					failed.push(`${applicant.label}: Netzwerkfehler`);
				}
				if (index < applicants.length - 1) {
					await sleep(estimatedDelayMs);
				}
			}

			setMessage(failed.length === 0 ? `${okCount} Ränge erfolgreich aktualisiert.` : `${okCount} aktualisiert, ${failed.length} fehlgeschlagen: ${failed.join(" · ")}`);
			router.refresh();
		});
	}

	const pendingLabel = confirmBulk ? `Aktualisiere ${Math.min(progressIndex + 1, effectiveTotal)}/${effectiveTotal}` : "Aktualisiere";

	return (
		<div className="grid gap-1">
			<button
				type="button"
				disabled={isPending}
				onClick={() => {
					if (confirmBulk) {
						setBulkConfirmOpen(true);
						return;
					}
					void refreshRanks();
				}}
				className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200/18 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-200/34 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isPending ? (
					<>
						<span className="size-3 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
						{pendingLabel}
					</>
				) : (
					label
				)}
			</button>
			{isPending && confirmBulk ? (
				<span className="text-[10px] font-bold text-cyan-100/70">{currentName ? `Gerade dran: ${currentName}` : "Riot-Refresh läuft rate-limit-schonend."}</span>
			) : null}
			{message ? <span className="text-[10px] font-bold text-emerald-100/54">{message}</span> : null}
			<ConfirmDialog
				open={bulkConfirmOpen}
				title="Alle Riot-Daten aktualisieren?"
				description="Alle Bewerbungs-Ränge und Riot-IDs werden nacheinander aktualisiert. Der Vorgang läuft absichtlich langsam, um die Riot Rate Limits einzuhalten."
				confirmLabel="Aktualisierung starten"
				cancelLabel="Abbrechen"
				onCancel={() => setBulkConfirmOpen(false)}
				onConfirm={() => void refreshRanks()}
			/>
		</div>
	);
}

function sleep(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchApplications(): Promise<BulkApplicant[]> {
	const response = await fetch("/api/tournament/applications");
	const json = (await response.json().catch(() => null)) as { applications?: ApplicationSummary[] } | null;
	if (!response.ok) return [];
	return (
		json?.applications
			?.filter((app): app is ApplicationSummary & { id: string } => Boolean(app.id))
			.map((app) => ({
				id: app.id,
				label: app.displayName || app.riotId || app.id,
			})) ?? []
	);
}
