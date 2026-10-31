"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { SwissAuditEntry, SwissCrossRecordPair, SwissPairing, SwissRematchPair, SwissStageState, SwissTeam } from "@/lib/tournament-swiss";

type Props = {
	initialState: SwissStageState;
	configuredRounds: number;
	teams: string[];
	testTeams?: SwissTeam[];
	testMode?: boolean;
	initialAudit?: SwissAuditEntry[];
};

export function SwissDrawControl({ initialState, configuredRounds, teams, testTeams = [], testMode = false, initialAudit = [] }: Props) {
	const [state, setState] = useState(initialState);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [resetOpen, setResetOpen] = useState(false);
	const [redrawOpen, setRedrawOpen] = useState(false);
	const [drawing, setDrawing] = useState(false);
	const [roulette, setRoulette] = useState<[string, string] | null>(null);
	const [revealed, setRevealed] = useState(false);
	const [audit, setAudit] = useState(initialAudit);
	const [crossRecord, setCrossRecord] = useState<{ round: number; pairs: SwissCrossRecordPair[] } | null>(null);
	const [rematch, setRematch] = useState<{ round: number; pairs: SwissRematchPair[] } | null>(null);
	const lastRound = state.rounds.at(-1);
	const finished = state.rounds.length >= configuredRounds && Boolean(lastRound?.complete);
	const targetRound = lastRound && !lastRound.complete ? lastRound.round : state.rounds.length + 1;
	const revealedInTargetRound = lastRound?.round === targetRound ? lastRound.pairings.length : 0;
	const unresolvedCurrentRound = Boolean(lastRound?.complete && lastRound.pairings.some((pairing) => !pairing.bye && !pairing.winnerTeamKey));
	const targetBracket = state.nextBracket ?? (state.rounds.length === 0 ? "0-0" : unresolvedCurrentRound ? "Ergebnisse offen" : nextRecordBracket(state, testTeams));

	function draw(approval: { allowCrossRecord?: boolean; allowRematch?: boolean } = {}) {
		setCrossRecord(null);
		setRematch(null);
		setMessage("");
		setError("");
		setDrawing(true);
		setRevealed(false);
		void (async () => {
			const animationEnd = Date.now() + 2200;
			while (Date.now() < animationEnd) {
				const first = teams[Math.floor(Math.random() * teams.length)] ?? "Team A";
				let second = teams[Math.floor(Math.random() * teams.length)] ?? "Team B";
				if (second === first && teams.length > 1) second = teams[(teams.indexOf(first) + 1) % teams.length];
				setRoulette([first, second]);
				await new Promise((resolve) => setTimeout(resolve, Date.now() > animationEnd - 700 ? 165 : 75));
			}
			const response = await fetch("/api/tournament/swiss", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "draw", test: testMode, ...approval }),
			});
			const json = (await response.json().catch(() => null)) as {
				state?: SwissStageState;
				round?: { round: number; complete: boolean } | number;
				pairing?: SwissPairing;
				message?: string;
				code?: string;
				crossRecordPairs?: SwissCrossRecordPair[];
				rematchPairs?: SwissRematchPair[];
			} | null;
			if (json?.code === "rematch-required" && json.rematchPairs) {
				// Nothing was stored: the admin decides whether the placement decider may be a rematch.
				setRematch({ round: typeof json.round === "number" ? json.round : targetRound, pairs: json.rematchPairs });
				setRoulette(null);
				setDrawing(false);
				return;
			}
			if (json?.code === "cross-record-required" && json.crossRecordPairs) {
				// Nothing was stored: the admin decides whether pairings across score pools are acceptable.
				setCrossRecord({ round: typeof json.round === "number" ? json.round : targetRound, pairs: json.crossRecordPairs });
				setRoulette(null);
				setDrawing(false);
				return;
			}
			if (!response.ok || !json?.state || !json.pairing || typeof json.round === "number") {
				setError(json?.message ?? "Swiss-Paarung konnte nicht ausgelost werden.");
				setRoulette(null);
				setDrawing(false);
				return;
			}
			setState(json.state);
			setRoulette([json.pairing.teamAName, json.pairing.teamBName ?? "Freilos"]);
			setRevealed(true);
			setMessage(json.round?.complete ? `Runde ${json.round.round} ist vollständig enthüllt.` : "Nächste Paarung wurde veröffentlicht.");
			void refreshAudit();
			setDrawing(false);
		})();
	}

	function reset() {
		setDrawing(true);
		void (async () => {
			const response = await fetch("/api/tournament/swiss", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "reset", confirmation: "SWISS ZURÜCKSETZEN", test: testMode }),
			});
			const json = (await response.json().catch(() => null)) as { state?: SwissStageState; message?: string } | null;
			if (!response.ok || !json?.state) setError(json?.message ?? "Swiss-Auslosung konnte nicht zurückgesetzt werden.");
			else {
				setState(json.state);
				setMessage("Alle Swiss-Paarungen wurden zurückgesetzt.");
				void refreshAudit();
			}
			setResetOpen(false);
			setRoulette(null);
			setRevealed(false);
			setDrawing(false);
		})();
	}

	function redrawCurrentRound() {
		setDrawing(true);
		setError("");
		void (async () => {
			const response = await fetch("/api/tournament/swiss", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "redraw", confirmation: "RUNDE NEU AUSLOSEN", test: testMode }),
			});
			const json = (await response.json().catch(() => null)) as { state?: SwissStageState; message?: string } | null;
			if (!response.ok || !json?.state) setError(json?.message ?? "Aktuelle Runde konnte nicht zurückgesetzt werden.");
			else {
				setState(json.state);
				setMessage("Die aktuelle Runde wurde entfernt und kann jetzt korrekt neu ausgelost werden.");
				void refreshAudit();
			}
			setRedrawOpen(false);
			setRoulette(null);
			setRevealed(false);
			setDrawing(false);
		})();
	}

	async function refreshAudit() {
		if (testMode) return;
		const response = await fetch("/api/tournament/swiss?audit=1", { cache: "no-store" });
		if (!response.ok) return;
		const result = (await response.json()) as { audit?: SwissAuditEntry[] };
		if (result.audit) setAudit(result.audit);
	}

	function setWinner(pairingId: string, winnerTeamKey: string) {
		setDrawing(true);
		setError("");
		void (async () => {
			const response = await fetch("/api/tournament/swiss", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "result", test: true, pairingId, winnerTeamKey }),
			});
			const json = (await response.json().catch(() => null)) as { state?: SwissStageState; message?: string } | null;
			if (!response.ok || !json?.state) setError(json?.message ?? "Testergebnis konnte nicht gespeichert werden.");
			else {
				setState(json.state);
				setMessage("Testergebnis gespeichert. Die Bilanzgruppen wurden aktualisiert.");
			}
			setDrawing(false);
		})();
	}

	return (
		<section className="mt-6 overflow-hidden rounded-[16px] border border-[var(--line)] bg-[#07160f]/92">
			<header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] p-5">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">{testMode ? "Swiss-Simulation" : "Swiss-Auslosung"}</div>
					<h2 className="mt-1 text-2xl font-semibold text-[var(--text)]">Paarung für Paarung</h2>
					<p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
						{testMode
							? "Sieger verändern die Bilanz-Brackets der nächsten Runde. Gepaart wird zufällig innerhalb derselben Bilanz, Rematches sind ausgeschlossen."
							: "Die gültige Runde wird verdeckt vorbereitet. Jeder Klick enthüllt mit Animation genau ein Match; frühere Gegner bleiben serverseitig gesperrt."}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<div className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-4 py-2 text-right">
						<div className="text-xs font-semibold text-[var(--muted)]">Aktuelle Ziehung</div>
						<div className="mt-0.5 font-mono text-sm font-semibold text-[var(--text)]">
							R{targetRound} · {targetBracket}
						</div>
					</div>
					<button
						type="button"
						disabled={drawing || finished || teams.length < 2 || unresolvedCurrentRound}
						onClick={() => draw()}
						className="bg-[var(--accent)] rounded-xl px-4 py-3 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-40"
					>
						{drawing
							? "Lostrommel läuft…"
							: finished
								? "Alle Runden ausgelost"
								: unresolvedCurrentRound
									? "Ergebnisse eintragen"
									: `R${targetRound} · Paarung ${revealedInTargetRound + 1} ziehen`}
					</button>
					{state.rounds.length ? (
						<button
							type="button"
							disabled={drawing}
							onClick={() => setRedrawOpen(true)}
							className="rounded-xl border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-3 py-3 text-xs font-semibold text-[var(--amber)] disabled:opacity-40"
						>
							Aktuelle Runde neu
						</button>
					) : null}
					{state.rounds.length ? (
						<button
							type="button"
							disabled={drawing}
							onClick={() => setResetOpen(true)}
							className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-3 text-xs font-semibold text-[var(--danger)] disabled:opacity-40"
						>
							Zurücksetzen
						</button>
					) : null}
				</div>
			</header>
			{roulette ? <Roulette pairing={roulette} drawing={drawing} revealed={revealed} /> : null}
			{testMode ? (
				<SwissTestBracket state={state} teams={testTeams} configuredRounds={configuredRounds} disabled={drawing} onWinner={setWinner} />
			) : (
				<RoundSummary state={state} teamCount={teams.length} />
			)}
			{message || error ? (
				<div
					className={`mx-4 mb-4 rounded-xl border px-3 py-2 text-xs font-medium ${error ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]" : "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]"}`}
				>
					{error || message}
				</div>
			) : null}
			{!testMode && audit.length ? (
				<details className="mx-4 mb-4 overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)]">
					<summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-[var(--muted)]">
						Auslosungsprotokoll · {audit.length} Einträge
					</summary>
					<div className="max-h-64 overflow-y-auto border-t border-[var(--line)] p-3">
						{audit.map((entry) => (
							<div key={entry.id} className="border-b border-[var(--line)] px-2 py-2.5 last:border-b-0">
								<div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--muted)]">
									<span>
										{entry.action} {entry.round ? `· Runde ${entry.round}` : ""}
									</span>
									<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</time>
								</div>
								<p className="mt-1 text-xs font-medium leading-5 text-[var(--muted)]">{entry.detail}</p>
								{entry.actor ? <div className="mt-1 text-xs text-[var(--muted)]">Ausgeführt von {entry.actor}</div> : null}
							</div>
						))}
					</div>
				</details>
			) : null}
			<ConfirmDialog
				open={Boolean(crossRecord)}
				title={`Runde ${crossRecord?.round ?? targetRound}: bilanzübergreifend paaren?`}
				description={
					<>
						In mindestens einer Bilanzgruppe gibt es keine Paarung ohne Rematch. Es wurde nichts gespeichert. Mit Freigabe lost der Server die Runde mit den wenigsten
						bilanzübergreifenden Paarungen aus, zum Beispiel:
						<ul className="mt-3 grid gap-1 font-medium">
							{crossRecord?.pairs.map((pair) => (
								<li key={`${pair.teamA}-${pair.teamB}`}>
									{pair.teamA} ({pair.recordA}) gegen {pair.teamB} ({pair.recordB})
								</li>
							))}
						</ul>
						<span className="mt-3 block">Die Freigabe wird im Auslosungsprotokoll vermerkt.</span>
					</>
				}
				confirmLabel="Freigeben und auslosen"
				cancelLabel="Abbrechen"
				tone="danger"
				onConfirm={() => draw({ allowCrossRecord: true })}
				onCancel={() => setCrossRecord(null)}
			/>
			<ConfirmDialog
				open={Boolean(rematch)}
				title={`Runde ${rematch?.round ?? targetRound}: Rematch freigeben?`}
				description={
					<>
						Die Platzierungsrunde paart nur Teams mit gleicher Bilanz. Diese Teams haben schon gegeneinander gespielt, eine andere Paarung mit gleicher Bilanz gibt es
						nicht. Es wurde nichts gespeichert.
						<ul className="mt-3 grid gap-1 font-medium">
							{rematch?.pairs.map((pair) => (
								<li key={`${pair.teamA}-${pair.teamB}`}>
									{pair.teamA} gegen {pair.teamB} ({pair.record})
								</li>
							))}
						</ul>
						<span className="mt-3 block">Die Freigabe wird im Auslosungsprotokoll vermerkt.</span>
					</>
				}
				confirmLabel="Rematch freigeben und auslosen"
				cancelLabel="Abbrechen"
				tone="danger"
				onConfirm={() => draw({ allowRematch: true })}
				onCancel={() => setRematch(null)}
			/>
			<ConfirmDialog
				open={redrawOpen}
				title="Aktuelle Swiss-Runde neu auslosen?"
				description="Nur die neueste, noch nicht gestartete Runde wird entfernt. Frühere Ergebnisse bleiben erhalten. Sobald ein Match vorbereitet, gewürfelt oder gestartet wurde, blockiert der Server diese Aktion."
				confirmLabel="Runde neu auslosen"
				cancelLabel="Abbrechen"
				tone="danger"
				onConfirm={redrawCurrentRound}
				onCancel={() => setRedrawOpen(false)}
			/>
			<ConfirmDialog
				open={resetOpen}
				title="Swiss-Auslosung zurücksetzen?"
				description={
					testMode
						? "Der gesamte isolierte Testverlauf wird gelöscht. Echte Matches und Teams bleiben unangetastet."
						: "Alle bereits enthüllten und verdeckt vorbereiteten Swiss-Paarungen sowie deren Match-Grunddaten werden gelöscht. Diese Aktion betrifft nicht die Teams."
				}
				confirmLabel="Swiss zurücksetzen"
				cancelLabel="Abbrechen"
				tone="danger"
				onConfirm={reset}
				onCancel={() => setResetOpen(false)}
			/>
		</section>
	);
}

function SwissTestBracket({
	state,
	teams,
	configuredRounds,
	disabled,
	onWinner,
}: {
	state: SwissStageState;
	teams: SwissTeam[];
	configuredRounds: number;
	disabled: boolean;
	onWinner: (pairingId: string, winnerTeamKey: string) => void;
}) {
	return (
		<div className="themed-scrollbar overflow-x-auto p-4">
			<div className="grid min-w-max gap-3" style={{ gridTemplateColumns: `repeat(${configuredRounds}, minmax(18rem, 1fr))` }}>
				{Array.from({ length: configuredRounds }, (_, index) => {
					const round = state.rounds.find((entry) => entry.round === index + 1);
					const buckets = groupByBracket(round?.pairings ?? []);
					return (
						<section key={index} className="min-h-[24rem] rounded-[16px] border border-[var(--line)] bg-[var(--admin-inset)] p-3">
							<div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
								<div>
									<div className="text-xs font-semibold text-[var(--muted)]">Bilanz-Brackets</div>
									<strong className="mt-1 block text-lg text-[var(--text)]">Runde {index + 1}</strong>
								</div>
								<span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">BO1</span>
							</div>
							<div className="mt-3 grid gap-3">
								{buckets.length ? (
									buckets.map(([bracket, pairings]) => (
										<div key={bracket} className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-2">
											<div className="mb-2 font-mono text-sm font-semibold text-[var(--text)]">{bracket}</div>
											<div className="grid gap-2">
												{pairings.map((pairing) => (
													<TestPairing key={pairing.id} pairing={pairing} disabled={disabled} onWinner={onWinner} />
												))}
											</div>
										</div>
									))
								) : (
									<div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center text-xs font-medium text-[var(--muted)]">Noch nicht ausgelost</div>
								)}
							</div>
						</section>
					);
				})}
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{teams.map((team) => (
					<span key={team.key} className="rounded-full border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
						{team.name}
					</span>
				))}
			</div>
		</div>
	);
}

function TestPairing({ pairing, disabled, onWinner }: { pairing: SwissPairing; disabled: boolean; onWinner: (pairingId: string, winnerTeamKey: string) => void }) {
	return (
		<div className="rounded-lg border border-[var(--line)] bg-[var(--admin-inset)] p-2">
			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs font-semibold text-[var(--text)]">
				<span className="truncate text-right">{pairing.teamAName}</span>
				<span className="text-[var(--muted)]">{pairing.bye ? "FREILOS" : "VS"}</span>
				<span className="truncate">{pairing.teamBName ?? "—"}</span>
			</div>
			{!pairing.bye ? (
				<div className="mt-2 grid grid-cols-2 gap-1">
					<button
						disabled={disabled || pairing.winnerTeamKey === pairing.teamAKey}
						onClick={() => onWinner(pairing.id, pairing.teamAKey)}
						className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${pairing.winnerTeamKey === pairing.teamAKey ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)]"}`}
					>
						{pairing.winnerTeamKey === pairing.teamAKey ? "Sieger" : pairing.teamAName}
					</button>
					<button
						disabled={disabled || pairing.winnerTeamKey === pairing.teamBKey}
						onClick={() => pairing.teamBKey && onWinner(pairing.id, pairing.teamBKey)}
						className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${pairing.winnerTeamKey === pairing.teamBKey ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)]"}`}
					>
						{pairing.winnerTeamKey === pairing.teamBKey ? "Sieger" : pairing.teamBName}
					</button>
				</div>
			) : (
				<div className="mt-2 text-center text-xs font-semibold text-[var(--muted)]">Automatischer Sieg</div>
			)}
		</div>
	);
}

function groupByBracket(pairings: SwissPairing[]) {
	const groups = new Map<string, SwissPairing[]>();
	for (const pairing of pairings) {
		const bracket = pairing.recordA === pairing.recordB ? (pairing.recordA ?? "0-0") : `${pairing.recordA ?? "?"} / ${pairing.recordB ?? "?"}`;
		groups.set(bracket, [...(groups.get(bracket) ?? []), pairing]);
	}
	return [...groups.entries()];
}

function nextRecordBracket(state: SwissStageState, teams: SwissTeam[]) {
	const records = new Map(teams.map((team) => [team.key, { wins: 0, losses: 0 }]));
	for (const round of state.rounds)
		for (const pairing of round.pairings) {
			if (pairing.bye) {
				const record = records.get(pairing.teamAKey);
				if (record) record.wins += 1;
			} else if (pairing.winnerTeamKey) {
				const winner = records.get(pairing.winnerTeamKey);
				if (winner) winner.wins += 1;
				const loser = pairing.winnerTeamKey === pairing.teamAKey ? pairing.teamBKey : pairing.teamAKey;
				const loserRecord = loser ? records.get(loser) : undefined;
				if (loserRecord) loserRecord.losses += 1;
			}
		}
	const labels = [...records.values()].map((record) => `${record.wins}-${record.losses}`).sort((a, b) => b.localeCompare(a));
	return labels[0] ?? "Nächste Bilanzgruppe";
}

function RoundSummary({ state, teamCount }: { state: SwissStageState; teamCount: number }) {
	return (
		<div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
			{state.rounds.length === 0 ? (
				<div className="rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--admin-inset)] p-5 text-sm text-[var(--muted)]">
					Noch keine Paarung enthüllt. Es stehen {teamCount} Teams bereit.
				</div>
			) : (
				state.rounds.map((round) => (
					<div key={round.round} className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-3">
						<div className="flex items-center justify-between">
							<strong className="text-sm text-[var(--text)]">Runde {round.round}</strong>
							<span className="text-xs font-semibold text-[var(--muted)]">
								{round.complete ? "Vollständig" : `${round.pairings.length} enthüllt`}
							</span>
						</div>
						<div className="mt-3 grid gap-1.5">
							{round.pairings.map((pairing) => (
								<div
									key={pairing.id}
									className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--admin-inset)] px-2 py-2 text-xs font-semibold text-[var(--muted)]"
								>
									<span className="truncate text-right">{pairing.teamAName}</span>
									<span className="text-[var(--muted)]">{pairing.bye ? "FREILOS" : "VS"}</span>
									<span className="truncate">{pairing.teamBName ?? "—"}</span>
								</div>
							))}
						</div>
					</div>
				))
			)}
		</div>
	);
}

function Roulette({ pairing, drawing, revealed }: { pairing: [string, string]; drawing: boolean; revealed: boolean }) {
	return (
		<div
			className={`relative mx-4 mt-4 overflow-hidden rounded-[12px] border px-5 py-7 ${revealed ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] " : "border-[var(--line)] bg-[var(--admin-step)]"}`}
		>
			<div className="absolute inset-0" />
			<div className={`relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center ${drawing ? "blur-[1px]" : ""}`}>
				<strong className="truncate text-xl text-[var(--text)] sm:text-3xl">{pairing[0]}</strong>
				<span className="text-xs font-semibold text-[var(--muted)]">VS</span>
				<strong className="truncate text-xl text-[var(--text)] sm:text-3xl">{pairing[1]}</strong>
			</div>
			<div className="relative mt-3 text-center text-xs font-semibold text-[var(--muted)]">
				{drawing ? "Teams werden gemischt" : "Paarung enthüllt"}
			</div>
		</div>
	);
}
