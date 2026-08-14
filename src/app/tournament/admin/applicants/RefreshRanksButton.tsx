"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

type RefreshChange = {
	field: string;
	before: string;
	after: string;
};

type RefreshResult = {
	ok?: boolean;
	message?: string;
	changes?: RefreshChange[];
};

type RefreshResponse = {
	okCount?: number;
	failCount?: number;
	message?: string;
	results?: RefreshResult[];
};

type ProgressEntry = {
	label: string;
	detail: string;
	tone: "changed" | "unchanged" | "error";
};

type BulkProgress = {
	total: number;
	completed: number;
	current: string | null;
	phase: "idle" | "request" | "pause" | "done";
	changed: number;
	unchanged: number;
	failed: number;
	etaDeadline: number;
};

const EMPTY_PROGRESS: BulkProgress = {
	total: 0,
	completed: 0,
	current: null,
	phase: "idle",
	changed: 0,
	unchanged: 0,
	failed: 0,
	etaDeadline: 0,
};

export function RefreshRanksButton({
	applicationId,
	label = "Spielerdaten aktualisieren",
	confirmBulk = false,
	estimatedDelayMs = 2600,
	scope = "applications",
}: {
	applicationId?: string;
	label?: string;
	confirmBulk?: boolean;
	totalCount?: number;
	applicantNames?: string[];
	estimatedDelayMs?: number;
	scope?: "applications" | "verified";
}) {
	const router = useRouter();
	const [message, setMessage] = useState("");
	const [runtimeApplicants, setRuntimeApplicants] = useState<BulkApplicant[]>([]);
	const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
	const [running, setRunning] = useState(false);
	const [bulkProgress, setBulkProgress] = useState<BulkProgress>(EMPTY_PROGRESS);
	const [recentEntries, setRecentEntries] = useState<ProgressEntry[]>([]);
	const [clock, setClock] = useState(() => Date.now());

	useEffect(() => {
		if (!confirmBulk || runtimeApplicants.length > 0) return;
		let cancelled = false;
		void fetchRefreshTargets(scope).then((loaded) => {
			if (!cancelled && loaded.length > 0) setRuntimeApplicants(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, [confirmBulk, runtimeApplicants.length, scope]);

	useEffect(() => {
		if (!running || !confirmBulk) return;
		const timer = window.setInterval(() => setClock(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [confirmBulk, running]);

	async function refreshOne(id?: string) {
		const response = await fetch("/api/tournament/ranks", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(id ? (scope === "verified" ? { puuid: id, audit: !confirmBulk } : { id, audit: !confirmBulk }) : {}),
		});
		const json = (await response.json().catch(() => null)) as RefreshResponse | null;
		return { response, json };
	}

	async function refreshPlayerData() {
		if (running) return;
		setBulkConfirmOpen(false);
		setMessage("");
		setRunning(true);

		if (!confirmBulk) {
			try {
				const { response, json } = await refreshOne(applicationId);
				if (!response.ok && response.status !== 429) {
					setMessage(json?.message ?? "Spielerdaten konnten nicht aktualisiert werden.");
					return;
				}
				const result = json?.results?.[0];
				const ok = json?.okCount ?? 0;
				const failed = json?.failCount ?? 0;
				setMessage(failed > 0 ? `${ok} ok, ${failed} Fehler.` : describeChanges(result?.changes));
				router.refresh();
			} catch {
				setMessage("Netzwerkfehler beim Aktualisieren der Spielerdaten. Bitte erneut versuchen.");
			} finally {
				setRunning(false);
			}
			return;
		}

		const applicants = runtimeApplicants.length > 0 ? runtimeApplicants : await fetchRefreshTargets(scope);
		if (applicants.length === 0) {
			setMessage(scope === "verified" ? "Keine verifizierten Riot-Konten gefunden." : "Keine Bewerbungen zum Aktualisieren gefunden.");
			setRunning(false);
			return;
		}

		setRuntimeApplicants(applicants);
		setRecentEntries([]);
		const initialEtaMs = applicants.length * 1500 + Math.max(0, applicants.length - 1) * estimatedDelayMs;
		setClock(Date.now());
		setBulkProgress({ ...EMPTY_PROGRESS, total: applicants.length, phase: "request", current: applicants[0].label, etaDeadline: Date.now() + initialEtaMs });

		let okCount = 0;
		let changedCount = 0;
		let unchangedCount = 0;
		let failedCount = 0;
		let totalRequestMs = 0;
		const failed: string[] = [];

		for (let index = 0; index < applicants.length; index += 1) {
			const applicant = applicants[index];
			setBulkProgress((current) => ({ ...current, current: applicant.label, phase: "request" }));
			const requestStartedAt = Date.now();
			let entry: ProgressEntry;

			try {
				const { response, json } = await refreshOne(applicant.id);
				totalRequestMs += Date.now() - requestStartedAt;
				const result = json?.results?.[0];
				if (response.ok && (json?.failCount ?? 0) === 0) {
					okCount += json?.okCount ?? 1;
					const changes = result?.changes ?? [];
					if (changes.length > 0) changedCount += 1;
					else unchangedCount += 1;
					entry = {
						label: applicant.label,
						detail: describeChanges(changes),
						tone: changes.length > 0 ? "changed" : "unchanged",
					};
				} else {
					failedCount += 1;
					const detail = result?.message ?? json?.message ?? `HTTP ${response.status}`;
					failed.push(`${applicant.label}: ${detail}`);
					entry = { label: applicant.label, detail, tone: "error" };
				}
			} catch {
				totalRequestMs += Date.now() - requestStartedAt;
				failedCount += 1;
				failed.push(`${applicant.label}: Netzwerkfehler`);
				entry = { label: applicant.label, detail: "Netzwerkfehler", tone: "error" };
			}

			const completed = index + 1;
			const remaining = applicants.length - completed;
			const averageRequestMs = Math.max(500, totalRequestMs / completed);
			const etaMs = remaining * (averageRequestMs + estimatedDelayMs);
			setRecentEntries((current) => [entry, ...current].slice(0, 4));
			setClock(Date.now());
			setBulkProgress({
				total: applicants.length,
				completed,
				current: applicant.label,
				phase: remaining > 0 ? "pause" : "done",
				changed: changedCount,
				unchanged: unchangedCount,
				failed: failedCount,
				etaDeadline: Date.now() + etaMs,
			});

			if (remaining > 0) await sleep(estimatedDelayMs);
		}

		setBulkProgress((current) => ({ ...current, current: null, phase: "done", etaDeadline: Date.now() }));
		await saveBulkAudit({ scope, okCount, failCount: failedCount, changedCount, unchangedCount });
		setRunning(false);
		setMessage(
			failed.length === 0
				? `${okCount} Riot-Profile geprüft: ${changedCount} geändert, ${unchangedCount} unverändert.`
				: `${okCount} geprüft, ${failed.length} fehlgeschlagen. ${failed.join(" · ")}`
		);
		router.refresh();
	}

	const showProgress = confirmBulk && bulkProgress.total > 0;
	const progressPercent = showProgress ? Math.round((bulkProgress.completed / bulkProgress.total) * 100) : 0;
	const etaMs = Math.max(0, bulkProgress.etaDeadline - clock);
	const phaseLabel =
		bulkProgress.phase === "request"
			? "Riot-Profil wird abgefragt"
			: bulkProgress.phase === "pause"
				? "Kurze Rate-Limit-Pause"
				: bulkProgress.phase === "done"
					? "Aktualisierung abgeschlossen"
					: "Bereit";

	return (
		<div className={`grid gap-2 ${showProgress ? "w-full min-w-0 sm:min-w-[32rem]" : ""}`}>
			<button
				type="button"
				disabled={running}
				onClick={() => {
					if (confirmBulk) {
						setBulkConfirmOpen(true);
						return;
					}
					void refreshPlayerData();
				}}
				className="inline-flex justify-self-start rounded-xl border border-cyan-200/18 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-200/34 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{running ? "Aktualisierung läuft" : label}
			</button>

			{showProgress ? (
				<div aria-live="polite" className="overflow-hidden rounded-2xl border border-cyan-200/16 bg-[#071712]/94 shadow-xl shadow-black/20">
					<div className="flex items-center justify-between gap-4 px-4 pb-2 pt-3">
						<div>
							<div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-100/50">Riot-Profil-Sync</div>
							<div className="mt-1 text-xs font-bold text-emerald-50">{phaseLabel}</div>
						</div>
						<div className="text-right">
							<div className="text-lg font-black tabular-nums text-cyan-100">
								{bulkProgress.completed}/{bulkProgress.total}
							</div>
							<div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-100/42">{progressPercent}%</div>
						</div>
					</div>

					<div className="mx-4 h-2 overflow-hidden rounded-full border border-white/8 bg-black/32">
						<div
							className="h-full rounded-full bg-gradient-to-r from-lime-300 via-emerald-300 to-cyan-300 transition-[width] duration-500"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>

					<div className="grid grid-cols-2 gap-px bg-white/6 sm:grid-cols-4">
						<ProgressStat label="Geändert" value={bulkProgress.changed} tone="changed" />
						<ProgressStat label="Unverändert" value={bulkProgress.unchanged} />
						<ProgressStat label="Fehler" value={bulkProgress.failed} tone={bulkProgress.failed > 0 ? "error" : "neutral"} />
						<ProgressStat label="Restzeit" value={running ? formatEta(etaMs) : "Fertig"} />
					</div>

					<div className="border-t border-white/7 px-4 py-3">
						<div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
							<span className="font-black uppercase tracking-[0.17em] text-emerald-100/42">
								{bulkProgress.phase === "request" ? "Gerade dran" : bulkProgress.phase === "pause" ? "Zuletzt geprüft" : "Letzter Stand"}
							</span>
							<span className="font-bold text-cyan-50">{bulkProgress.current ?? "Alle Profile verarbeitet"}</span>
						</div>
						{recentEntries.length > 0 ? (
							<div className="mt-2 grid gap-1.5">
								{recentEntries.map((entry, index) => (
									<div key={`${entry.label}-${index}`} className="flex min-w-0 items-start justify-between gap-3 rounded-lg bg-black/20 px-2.5 py-2 text-[10px]">
										<span className="shrink-0 font-bold text-emerald-50/74">{entry.label}</span>
										<span
											className={`min-w-0 text-right font-semibold ${
												entry.tone === "error" ? "text-red-200" : entry.tone === "changed" ? "text-lime-200" : "text-emerald-100/42"
											}`}
										>
											{entry.detail}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				</div>
			) : null}

			{message ? <span className="max-w-2xl text-[10px] font-bold leading-5 text-emerald-100/54">{message}</span> : null}
			<ConfirmDialog
				open={bulkConfirmOpen}
				title="Alle Riot-Daten aktualisieren?"
				description={`Riot-ID, aktueller Rang und Summoner-Level ${scope === "verified" ? "aller dauerhaft verknüpften Riot-Konten" : "aller Bewerber"} werden nacheinander aktualisiert. Der Vorgang läuft absichtlich langsam, um die Riot Rate Limits einzuhalten.${runtimeApplicants.length > 0 ? ` Geplant: ${runtimeApplicants.length} Profile.` : ""}`}
				confirmLabel="Aktualisierung starten"
				cancelLabel="Abbrechen"
				onCancel={() => setBulkConfirmOpen(false)}
				onConfirm={() => void refreshPlayerData()}
			/>
		</div>
	);
}

function ProgressStat({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "changed" | "error" }) {
	return (
		<div className="bg-[#0a1b14] px-3 py-2.5">
			<div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/34">{label}</div>
			<div className={`mt-1 text-sm font-black tabular-nums ${tone === "error" ? "text-red-200" : tone === "changed" ? "text-lime-200" : "text-emerald-50"}`}>{value}</div>
		</div>
	);
}

function describeChanges(changes?: RefreshChange[]) {
	if (!changes || changes.length === 0) return "Keine Änderungen";
	return changes.map((change) => `${change.field}: ${change.before} → ${change.after}`).join(" · ");
}

function formatEta(milliseconds: number) {
	if (milliseconds <= 1000) return "< 1 Sek.";
	const seconds = Math.ceil(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes === 0) return `ca. ${seconds} Sek.`;
	return `ca. ${minutes}:${remainingSeconds.toString().padStart(2, "0")} Min.`;
}

function sleep(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchRefreshTargets(scope: "applications" | "verified"): Promise<BulkApplicant[]> {
	if (scope === "verified") {
		const response = await fetch("/api/tournament/ranks");
		const json = (await response.json().catch(() => null)) as { accounts?: BulkApplicant[] } | null;
		return response.ok ? (json?.accounts ?? []) : [];
	}
	const response = await fetch("/api/tournament/applications");
	const json = (await response.json().catch(() => null)) as { applications?: ApplicationSummary[] } | null;
	if (!response.ok) return [];
	return (
		json?.applications
			?.filter((app): app is ApplicationSummary & { id: string } => Boolean(app.id))
			.map((app) => ({
				id: app.id,
				label: app.displayName && app.riotId ? `${app.displayName} · ${app.riotId}` : app.displayName || app.riotId || app.id,
			})) ?? []
	);
}

async function saveBulkAudit(summary: {
	scope: "applications" | "verified";
	okCount: number;
	failCount: number;
	changedCount: number;
	unchangedCount: number;
}) {
	await fetch("/api/tournament/ranks", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(summary),
	}).catch(() => null);
}
