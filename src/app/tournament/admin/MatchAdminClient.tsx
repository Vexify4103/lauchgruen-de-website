"use client";

import { TournamentLink as Link } from "../TournamentLink";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { StoredTournamentMatch } from "@/lib/tournament-storage";
import { formatGameDuration } from "@/lib/match-duration";
import { ThemedNumberInput } from "@/components/ThemedNumberInput";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";

type MatchStatus = NonNullable<StoredTournamentMatch["status"]>;

const statusToneClass: Record<MatchStatus, string> = {
	Scheduled: "border-[var(--line)] bg-[var(--admin-inset)] text-[var(--text)]",
	Live: "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]",
	Finished: "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]",
	Pending: "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] text-[var(--amber)]",
	Locked: "border-[var(--line)] bg-[var(--admin-inset)] text-[var(--muted)]",
};

export type AdminMatch = {
	id: string;
	phase: "play-in" | "groups" | "playoffs";
	group?: string;
	round: string;
	teamA: string; // resolved display name or a group-placement placeholder
	teamB: string;
	status: MatchStatus;
	poolsDrawn: boolean;
};

export function MatchAdminClient({
	initialMatches,
	initialStored,
	initialVersions,
	ultimateBravery = false,
}: {
	initialMatches: AdminMatch[];
	initialStored: Record<string, StoredTournamentMatch>;
	initialVersions: Record<string, number>;
	ultimateBravery?: boolean;
}) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [stored, setStored] = useState(initialStored);
	const [versions, setVersions] = useState(initialVersions);
	const [preparedMatchIds, setPreparedMatchIds] = useState(
		() => new Set(initialMatches.filter((match) => match.poolsDrawn || (ultimateBravery && match.status !== "Scheduled")).map((match) => match.id))
	);
	const [preparingId, setPreparingId] = useState<string | null>(null);
	const [message, setMessage] = useState("");
	const [isPreparing, startPreparing] = useTransition();

	async function updateMatch(id: string, values: { scoreA: string; scoreB: string; gameDuration: string }): Promise<boolean> {
		const response = await fetch("/api/tournament/matches", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id,
				expectedVersion: versions[id] ?? 0,
				scoreA: values.scoreA,
				scoreB: values.scoreB,
				gameDuration: values.gameDuration,
			}),
		});

		const result = (await response.json().catch(() => null)) as { match?: StoredTournamentMatch; message?: string; version?: number } | null;

		if (!response.ok || !result?.match) {
			if (isAdminVersionConflict(response, result)) {
				showConflict(result);
				return false;
			}
			setMessage(result?.message ?? "Match konnte nicht aktualisiert werden.");
			return false;
		}

		setStored((current) => ({ ...current, [id]: result.match! }));
		if (result.version !== undefined) {
			setVersions((current) => ({ ...current, [id]: result.version! }));
		}
		setMessage("Match aktualisiert.");
		// Re-fetch server data so dependent playoff slots refresh with the new team names.
		router.refresh();
		return true;
	}

	function prepareMatch(match: AdminMatch) {
		if (isPreparing || match.status !== "Scheduled" || preparedMatchIds.has(match.id)) {
			return;
		}

		setMessage("");
		setPreparingId(match.id);
		startPreparing(async () => {
			const response = await fetch("/api/tournament/matches/start", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: match.id }),
			});
			const result = (await response.json().catch(() => null)) as { message?: string; drewPools?: boolean } | null;

			if (!response.ok) {
				setMessage(result?.message ?? "Pools konnten nicht gezogen werden.");
				setPreparingId(null);
				return;
			}

			setPreparedMatchIds((current) => new Set(current).add(match.id));
			setMessage(
				ultimateBravery
					? (result?.message ?? `Rolls für ${match.teamA} vs. ${match.teamB} freigegeben und Teamnachrichten eingereiht.`)
					: result?.drewPools
						? `Pools für ${match.teamA} vs. ${match.teamB} gezogen.`
						: "Dieses Match war bereits vorbereitet."
			);
			setPreparingId(null);
			router.refresh();
		});
	}

	return (
		<div className="grid gap-4">
			{message ? (
				<div role="status" className="rounded-[12px] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3 text-sm text-[var(--accent)]">
					{message}
				</div>
			) : null}

			{groupMatchesByRound(initialMatches).map(({ label, matches }) => (
				<section key={label} className="grid gap-3">
					<div className="flex items-center gap-3 px-1">
						<span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
						<span className="h-px flex-1 bg-[var(--admin-step)]" />
						{matches.length > 1 ? <span className="text-xs font-semibold text-[var(--muted)]">Parallel</span> : null}
					</div>
					<div className="grid gap-4 xl:grid-cols-2">
						{matches.map((match) => (
							<MatchRow
								key={match.id}
								base={match}
								stored={stored[match.id] ?? { id: match.id }}
								poolsDrawn={preparedMatchIds.has(match.id)}
								preparing={preparingId === match.id}
								ultimateBravery={ultimateBravery}
								onPrepare={() => prepareMatch(match)}
								onSave={(values) => updateMatch(match.id, values)}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

function groupMatchesByRound(matches: AdminMatch[]) {
	const sections = new Map<string, AdminMatch[]>();
	for (const match of matches) {
		const groupRound = match.phase === "groups" ? /^[a-p]-r(\d+)-\d+$/.exec(match.id)?.[1] : null;
		const label = groupRound
			? `Gruppenphase · Runde ${groupRound}`
			: match.phase === "play-in"
				? "Play-in"
				: match.phase === "groups"
					? match.group
						? `Tag 1 · Gruppe ${match.group}`
						: `Tag 1 · ${match.round}`
					: `Playoffs · ${match.round}`;
		sections.set(label, [...(sections.get(label) ?? []), match]);
	}
	return [...sections.entries()].map(([label, entries]) => ({
		label,
		matches: entries.sort((a, b) => a.id.localeCompare(b.id)),
	}));
}

function MatchRow({
	base,
	stored,
	poolsDrawn,
	preparing,
	ultimateBravery,
	onPrepare,
	onSave,
}: {
	base: AdminMatch;
	stored: StoredTournamentMatch;
	poolsDrawn: boolean;
	preparing: boolean;
	ultimateBravery: boolean;
	onPrepare: () => void;
	onSave: (values: { scoreA: string; scoreB: string; gameDuration: string }) => Promise<boolean>;
}) {
	const status = base.status;
	const tone = statusToneClass[status] ?? statusToneClass.Scheduled;
	const [scoreA, setScoreA] = useState(stored.scoreA?.toString() ?? "");
	const [scoreB, setScoreB] = useState(stored.scoreB?.toString() ?? "");
	const [gameDuration, setGameDuration] = useState(formatGameDuration(stored.gameDurationSeconds));
	const [saving, setSaving] = useState(false);
	const [savedValues, setSavedValues] = useState(JSON.stringify({ scoreA, scoreB, gameDuration }));
	const currentValues = JSON.stringify({ scoreA, scoreB, gameDuration });

	async function saveRow(): Promise<boolean> {
		setSaving(true);
		const saved = await onSave({ scoreA, scoreB, gameDuration });
		setSaving(false);
		if (saved) setSavedValues(currentValues);
		return saved;
	}

	useUnsavedChanges({
		dirty: currentValues !== savedValues,
		label: `Match ${base.id}`,
		save: saveRow,
	});

	return (
		<form
			onSubmit={(event: FormEvent<HTMLFormElement>) => {
				event.preventDefault();
				void saveRow();
			}}
			className="grid gap-4 rounded-[16px] border border-[var(--line)] bg-[var(--admin-inset)] p-4 sm:p-5"
		>
			<input type="hidden" name="id" value={base.id} />

			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-xs font-semibold text-[var(--muted)]">{base.id}</div>
					<div className="mt-2 break-words text-lg font-semibold text-[var(--text)]">
						<span>{base.teamA}</span>
						<span className="mx-2 text-[var(--muted)]">vs</span>
						<span>{base.teamB}</span>
					</div>
				</div>
				<span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{status}</span>
			</header>

			<div className="grid gap-3 sm:grid-cols-2">
				<NumberField short="A" team={base.teamA} value={scoreA} onChange={setScoreA} />
				<NumberField short="B" team={base.teamB} value={scoreB} onChange={setScoreB} />
				<label className="grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Spielzeit</span>
					<input
						name="game-duration"
						autoComplete="off"
						inputMode="numeric"
						placeholder="mm:ss…"
						pattern="\d{1,3}:[0-5]\d"
						value={gameDuration}
						onChange={(event) => setGameDuration(event.target.value)}
						className="w-full rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2.5 text-center text-sm font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
					/>
				</label>

				<div className="grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Status (automatisch)</span>
					<div className="flex h-[42px] items-center rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 text-sm font-semibold text-[var(--muted)]">{status}</div>
				</div>

				<div className="grid min-w-0 gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Sieger (auto)</span>
					<div
						className={`flex h-[42px] items-center truncate rounded-xl border px-3 text-sm font-semibold ${
							stored.winner ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--admin-inset)] text-[var(--muted)]"
						}`}
						title={stored.winner ?? "Wird aus den Scores berechnet"}
					>
						{stored.winner ?? "—"}
					</div>
				</div>

				<div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
					<button
						type="submit"
						disabled={status === "Locked" || saving}
						className="bg-[var(--accent)] rounded-xl px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition disabled:cursor-not-allowed disabled:opacity-40"
					>
						{saving ? "Wird gespeichert…" : status === "Locked" ? "Teilnehmer offen" : "Ergebnis speichern"}
					</button>
					<button
						type="button"
						onClick={onPrepare}
						disabled={poolsDrawn || preparing || status !== "Scheduled"}
						className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-5 py-3 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--line-strong)] hover:bg-[var(--admin-step)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--admin-step)] disabled:text-[var(--muted)]"
					>
						{preparing
							? ultimateBravery
								? "Rolls werden freigegeben…"
								: "Pools werden gezogen…"
							: poolsDrawn
								? ultimateBravery
									? "Rolls freigegeben"
									: "Pools gezogen"
								: status === "Locked"
									? "Teilnehmer offen"
									: status !== "Scheduled"
										? "Draft läuft"
										: ultimateBravery
											? "Rolls freigeben & Teams pingen"
											: "Pools ziehen"}
					</button>
					<Link
						href={`/tournament/admin/matches/${base.id}`}
						className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-5 py-3 text-center text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
					>
						Control Room
					</Link>
				</div>
			</div>
		</form>
	);
}

function NumberField({ short, team, value, onChange }: { short: string; team: string; value: string; onChange: (value: string) => void }) {
	return (
		<label className="grid gap-2" title={`Score · ${team}`}>
			<span className="text-xs font-semibold text-[var(--muted)]">Score {short}</span>
			<ThemedNumberInput min={0} value={value} onChange={onChange} ariaLabel={`Score ${short} · ${team}`} />
		</label>
	);
}
