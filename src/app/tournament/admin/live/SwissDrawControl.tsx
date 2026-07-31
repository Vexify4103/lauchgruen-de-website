"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { SwissAuditEntry, SwissPairing, SwissStageState, SwissTeam } from "@/lib/tournament-swiss";

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
	const [drawing, setDrawing] = useState(false);
	const [roulette, setRoulette] = useState<[string, string] | null>(null);
	const [revealed, setRevealed] = useState(false);
	const [audit, setAudit] = useState(initialAudit);
	const lastRound = state.rounds.at(-1);
	const finished = state.rounds.length >= configuredRounds && Boolean(lastRound?.complete);
	const targetRound = lastRound && !lastRound.complete ? lastRound.round : state.rounds.length + 1;
	const revealedInTargetRound = lastRound?.round === targetRound ? lastRound.pairings.length : 0;
	const unresolvedCurrentRound = Boolean(lastRound?.complete && lastRound.pairings.some((pairing) => !pairing.bye && !pairing.winnerTeamKey));
	const targetBracket = state.nextBracket ?? (state.rounds.length === 0 ? "0-0" : unresolvedCurrentRound ? "Ergebnisse offen" : nextRecordBracket(state, testTeams));

	function draw() {
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
				body: JSON.stringify({ action: "draw", test: testMode }),
			});
			const json = (await response.json().catch(() => null)) as {
				state?: SwissStageState;
				round?: { round: number; complete: boolean };
				pairing?: SwissPairing;
				message?: string;
			} | null;
			if (!response.ok || !json?.state || !json.pairing) {
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
		<section className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-200/16 bg-[#07160f]/92 shadow-xl shadow-black/25">
			<header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/8 bg-gradient-to-r from-cyan-300/[0.07] via-transparent to-lime-200/[0.04] p-5">
				<div>
					<div className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-100/58">{testMode ? "Swiss-Simulation" : "Swiss-Auslosung"}</div>
					<h2 className="mt-1 text-2xl font-black text-emerald-50">Eine Paarung nach der anderen.</h2>
					<p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-100/48">
						{testMode
							? "Sieger verändern die Bilanz-Brackets der nächsten Runde. Paarungen bleiben zufällig, Rematches sind ausgeschlossen."
							: "Die gültige Runde wird verdeckt vorbereitet. Jeder Klick enthüllt mit Animation genau ein Match; frühere Gegner bleiben serverseitig gesperrt."}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<div className="rounded-xl border border-cyan-200/18 bg-cyan-300/[0.06] px-4 py-2 text-right">
						<div className="text-[8px] font-black uppercase tracking-[0.16em] text-cyan-100/42">Aktuelle Ziehung</div>
						<div className="mt-0.5 font-mono text-sm font-black text-cyan-50">
							R{targetRound} · {targetBracket}
						</div>
					</div>
					<button
						type="button"
						disabled={drawing || finished || teams.length < 2 || unresolvedCurrentRound}
						onClick={draw}
						className="rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-cyan-950/30 disabled:opacity-40"
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
							onClick={() => setResetOpen(true)}
							className="rounded-xl border border-red-300/18 bg-red-500/[0.07] px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-red-100 disabled:opacity-40"
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
					className={`mx-4 mb-4 rounded-xl border px-3 py-2 text-xs font-bold ${error ? "border-red-300/24 bg-red-500/10 text-red-100" : "border-lime-200/20 bg-lime-200/8 text-lime-50"}`}
				>
					{error || message}
				</div>
			) : null}
			{!testMode && audit.length ? (
				<details className="mx-4 mb-4 overflow-hidden rounded-2xl border border-white/9 bg-black/16">
					<summary className="cursor-pointer px-4 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/58">Auslosungsprotokoll · {audit.length} Einträge</summary>
					<div className="max-h-64 overflow-y-auto border-t border-white/8 p-3">
						{audit.map((entry) => (
							<div key={entry.id} className="border-b border-white/7 px-2 py-2.5 last:border-b-0">
								<div className="flex flex-wrap items-center justify-between gap-2 text-[8px] font-black uppercase tracking-[0.13em] text-emerald-100/35">
									<span>{entry.action} {entry.round ? `· Runde ${entry.round}` : ""}</span>
									<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("de-DE")}</time>
								</div>
								<p className="mt-1 text-[11px] font-bold leading-5 text-emerald-50/70">{entry.detail}</p>
								{entry.actor ? <div className="mt-1 text-[9px] text-cyan-100/40">Ausgeführt von {entry.actor}</div> : null}
							</div>
						))}
					</div>
				</details>
			) : null}
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
						<section key={index} className="min-h-[24rem] rounded-[1.6rem] border border-white/9 bg-black/18 p-3">
							<div className="flex items-center justify-between border-b border-white/8 pb-3">
								<div>
									<div className="text-[8px] font-black uppercase tracking-[0.18em] text-cyan-100/42">Bilanz-Brackets</div>
									<strong className="mt-1 block text-lg text-emerald-50">Runde {index + 1}</strong>
								</div>
								<span className="rounded-full border border-white/8 px-2 py-1 text-[8px] font-black text-emerald-100/38">BO1</span>
							</div>
							<div className="mt-3 grid gap-3">
								{buckets.length ? (
									buckets.map(([bracket, pairings]) => (
										<div key={bracket} className="rounded-xl border border-cyan-200/12 bg-cyan-300/[0.035] p-2">
											<div className="mb-2 font-mono text-sm font-black text-cyan-100">{bracket}</div>
											<div className="grid gap-2">
												{pairings.map((pairing) => (
													<TestPairing key={pairing.id} pairing={pairing} disabled={disabled} onWinner={onWinner} />
												))}
											</div>
										</div>
									))
								) : (
									<div className="rounded-xl border border-dashed border-white/9 p-5 text-center text-xs font-bold text-emerald-100/34">Noch nicht ausgelost</div>
								)}
							</div>
						</section>
					);
				})}
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{teams.map((team) => (
					<span key={team.key} className="rounded-full border border-white/8 bg-black/18 px-3 py-1.5 text-[9px] font-black text-emerald-100/48">
						{team.name}
					</span>
				))}
			</div>
		</div>
	);
}

function TestPairing({ pairing, disabled, onWinner }: { pairing: SwissPairing; disabled: boolean; onWinner: (pairingId: string, winnerTeamKey: string) => void }) {
	return (
		<div className="rounded-lg border border-white/[0.07] bg-black/24 p-2">
			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[10px] font-black text-emerald-50">
				<span className="truncate text-right">{pairing.teamAName}</span>
				<span className="text-cyan-200/60">{pairing.bye ? "FREILOS" : "VS"}</span>
				<span className="truncate">{pairing.teamBName ?? "—"}</span>
			</div>
			{!pairing.bye ? (
				<div className="mt-2 grid grid-cols-2 gap-1">
					<button
						disabled={disabled || pairing.winnerTeamKey === pairing.teamAKey}
						onClick={() => onWinner(pairing.id, pairing.teamAKey)}
						className={`rounded-md border px-2 py-1.5 text-[8px] font-black uppercase ${pairing.winnerTeamKey === pairing.teamAKey ? "border-lime-200/28 bg-lime-200/14 text-lime-50" : "border-white/8 text-emerald-100/48"}`}
					>
						{pairing.winnerTeamKey === pairing.teamAKey ? "Sieger" : pairing.teamAName}
					</button>
					<button
						disabled={disabled || pairing.winnerTeamKey === pairing.teamBKey}
						onClick={() => pairing.teamBKey && onWinner(pairing.id, pairing.teamBKey)}
						className={`rounded-md border px-2 py-1.5 text-[8px] font-black uppercase ${pairing.winnerTeamKey === pairing.teamBKey ? "border-lime-200/28 bg-lime-200/14 text-lime-50" : "border-white/8 text-emerald-100/48"}`}
					>
						{pairing.winnerTeamKey === pairing.teamBKey ? "Sieger" : pairing.teamBName}
					</button>
				</div>
			) : (
				<div className="mt-2 text-center text-[8px] font-black uppercase text-lime-100/48">Automatischer Sieg</div>
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
				<div className="rounded-2xl border border-dashed border-white/10 bg-black/14 p-5 text-sm text-emerald-100/45">
					Noch keine Paarung enthüllt. Es stehen {teamCount} Teams bereit.
				</div>
			) : (
				state.rounds.map((round) => (
					<div key={round.round} className="rounded-2xl border border-white/9 bg-black/18 p-3">
						<div className="flex items-center justify-between">
							<strong className="text-sm text-emerald-50">Runde {round.round}</strong>
							<span className="text-[9px] font-black uppercase tracking-[0.13em] text-cyan-100/42">
								{round.complete ? "Vollständig" : `${round.pairings.length} enthüllt`}
							</span>
						</div>
						<div className="mt-3 grid gap-1.5">
							{round.pairings.map((pairing) => (
								<div
									key={pairing.id}
									className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-2 text-[10px] font-black text-emerald-100/68"
								>
									<span className="truncate text-right">{pairing.teamAName}</span>
									<span className="text-cyan-200/62">{pairing.bye ? "FREILOS" : "VS"}</span>
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
			className={`relative mx-4 mt-4 overflow-hidden rounded-2xl border px-5 py-7 ${revealed ? "border-lime-200/28 bg-lime-200/[0.09] shadow-lg shadow-lime-950/30" : "border-cyan-200/20 bg-cyan-300/[0.06]"}`}
		>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_58%)]" />
			<div className={`relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center ${drawing ? "blur-[1px]" : ""}`}>
				<strong className="truncate text-xl text-emerald-50 sm:text-3xl">{pairing[0]}</strong>
				<span className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/58">VS</span>
				<strong className="truncate text-xl text-emerald-50 sm:text-3xl">{pairing[1]}</strong>
			</div>
			<div className="relative mt-3 text-center text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100/38">
				{drawing ? "Teams werden gemischt" : "Paarung enthüllt"}
			</div>
		</div>
	);
}
