"use client";

import type { TournamentSettings } from "@/lib/tournament-settings";
import type { SwissPairing, SwissStageState } from "@/lib/tournament-swiss";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { useLayoutEffect, useRef, type ReactNode } from "react";

type StageConfig = TournamentSettings["ultimateBravery"];

function combinations(total: number, selected: number) {
	if (selected < 0 || selected > total) return 0;
	let result = 1;
	for (let index = 1; index <= selected; index += 1) result = (result * (total - selected + index)) / index;
	return result;
}

function estimateTeamsInRecord(teamCount: number, gamesPlayed: number, wins: number) {
	return Math.max(0, Math.round((teamCount * combinations(gamesPlayed, wins)) / 2 ** gamesPlayed));
}

function recordBuckets(round: number, targetWins: number) {
	const gamesPlayed = round - 1;
	return Array.from({ length: gamesPlayed + 1 }, (_, losses) => ({ wins: gamesPlayed - losses, losses })).filter(
		(record) => record.wins < targetWins && record.losses < targetWins
	);
}

function recordKey(wins: number, losses: number) {
	return `${wins}-${losses}`;
}

function pairingRecordKey(pairing: SwissPairing) {
	const first = pairing.recordA ?? "0-0";
	const second = pairing.recordB ?? first;
	return first === second ? first : `${first} ↔ ${second}`;
}

function nextRecordText(wins: number, losses: number, targetWins: number) {
	const winRecord = recordKey(wins + 1, losses);
	const lossRecord = recordKey(wins, losses + 1);
	const winTerminal = wins + 1 >= targetWins;
	const lossTerminal = losses + 1 >= targetWins;
	if (winTerminal && lossTerminal) return "Beide Platzierungen werden entschieden";
	if (winTerminal) return `Sieger qualifiziert · Verlierer → ${lossRecord}`;
	if (lossTerminal) return `Sieger → ${winRecord} · Verlierer ausgeschieden`;
	return `Sieger → ${winRecord} · Verlierer → ${lossRecord}`;
}

const placementMatchCounts: Record<number, Record<string, number>> = {
	1: { "0-0": 4 },
	2: { "1-0": 2, "0-1": 2 },
	3: { "2-0": 1, "1-1": 2, "0-2": 1 },
	4: { "2-1": 1, "1-2": 1 },
};

const placementNextLabels: Record<string, string> = {
	"1:0-0": "Sieger → 1-0 · Verlierer → 0-1",
	"2:1-0": "Sieger → 2-0 · Verlierer → 1-1",
	"2:0-1": "Sieger → 1-1 · Verlierer → 0-2",
	"3:2-0": "Sieger = Seed #1 · Verlierer = Seed #2",
	"3:1-1": "Sieger → Spiel um #3/#4 · Verlierer → Spiel um #5/#6",
	"3:0-2": "Sieger = Seed #7 · Verlierer = Seed #8",
	"4:2-1": "Sieger = Seed #3 · Verlierer = Seed #4",
	"4:1-2": "Sieger = Seed #5 · Verlierer = Seed #6",
};

export function SwissStageBoard({ config, teamNames, state, activeRound = 1 }: { config: StageConfig; teamNames: string[]; state: SwissStageState; activeRound?: number }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const lastFocusedRound = useRef<number | null>(null);
	const targetWins = Math.floor(config.swissRounds / 2) + 1;
	const placementSwiss = config.teamCount === 8 && config.advanceTeamCount === 8 && config.swissRounds === 4;

	useLayoutEffect(() => {
		if (lastFocusedRound.current === activeRound) return;
		const scroller = scrollRef.current;
		const target = scroller?.querySelector<HTMLElement>(`[data-swiss-round="${activeRound}"]`);
		if (!scroller || !target) return;
		const scrollerRect = scroller.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		const targetCenter = targetRect.left - scrollerRect.left + scroller.scrollLeft + targetRect.width / 2;
		const left = Math.max(0, Math.min(targetCenter - scroller.clientWidth / 2, scroller.scrollWidth - scroller.clientWidth));
		scroller.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
		lastFocusedRound.current = activeRound;
	}, [activeRound]);

	return (
		<div className="overflow-hidden rounded-[2.4rem] border border-cyan-200/14 bg-[#07140e]/92 shadow-2xl shadow-black/30">
			<header className="border-b border-white/8 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.1),transparent_35%)] px-6 py-6 sm:px-8">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-100/54">Random Swiss · ohne Rematches</div>
						<h2 className="mt-2 text-3xl font-black text-emerald-50">Jeder Weg durch die Swiss Stage.</h2>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/54">
							Leere Plätze werden bei der Auslosung automatisch gefüllt. Bereits gespielte Gegner bleiben für alle späteren Runden gesperrt.
						</p>
					</div>
					<span className="rounded-full border border-lime-200/18 bg-lime-200/8 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-lime-100">
						Top {config.advanceTeamCount} weiter
					</span>
				</div>
				{teamNames.length ? (
					<div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
						{teamNames.map((team) => (
							<span key={team} className="rounded-full border border-white/9 bg-black/18 px-3 py-1.5 text-[10px] font-black text-emerald-100/62">
								{team}
							</span>
						))}
					</div>
				) : null}
			</header>
			<div ref={scrollRef} className="themed-scrollbar overflow-x-auto p-4 sm:p-6">
				<div className="grid min-w-max items-stretch gap-4" style={{ gridTemplateColumns: `repeat(${config.swissRounds}, minmax(17rem, 1fr)) minmax(14rem, 0.8fr)` }}>
					{Array.from({ length: config.swissRounds }, (_, roundIndex) => {
						const roundNumber = roundIndex + 1;
						const expectedBuckets = recordBuckets(roundNumber, targetWins);
						const actualRound = state.rounds.find((round) => round.round === roundNumber);
						const expectedKeys = new Set(expectedBuckets.map((record) => recordKey(record.wins, record.losses)));
						const unexpectedKeys = [...new Set((actualRound?.pairings ?? []).map(pairingRecordKey).filter((key) => !expectedKeys.has(key)))];
						return (
							<section
								key={roundNumber}
								data-swiss-round={roundNumber}
								className={`relative flex min-h-[34rem] flex-col rounded-[1.7rem] border p-3 transition ${
									roundNumber === activeRound
										? "border-cyan-200/32 bg-cyan-300/[0.07] shadow-[0_0_2rem_rgb(34_211_238/0.08)]"
										: roundNumber > activeRound
											? "border-white/7 bg-black/10 opacity-70"
											: "border-white/8 bg-black/16"
								}`}
							>
								<div className="flex items-center justify-between border-b border-white/8 px-1 pb-3">
									<div>
										<div className="text-[8px] font-black uppercase tracking-[0.2em] text-cyan-100/42">Runde {String(roundNumber).padStart(2, "0")}</div>
										<strong className="mt-1 block text-sm text-emerald-50">
											{roundNumber === activeRound ? "Aktueller Swiss-Pfad" : roundNumber < activeRound ? "Abgeschlossen" : "Folgt nach Ergebnissen"}
										</strong>
									</div>
									<span className="rounded-full border border-white/8 px-2 py-1 text-[8px] font-black text-emerald-100/38">BO1</span>
								</div>
								<div className="flex flex-1 flex-col justify-around gap-3 py-3">
									{[
										...expectedBuckets.map((record) => ({ key: recordKey(record.wins, record.losses), ...record })),
										...unexpectedKeys.map((key) => ({ key, wins: -1, losses: -1 })),
									].map((record) => {
										const pairings = (actualRound?.pairings ?? []).filter((pairing) => pairingRecordKey(pairing) === record.key);
										const estimatedTeams = record.wins < 0 ? pairings.length * 2 : estimateTeamsInRecord(config.teamCount, roundNumber - 1, record.wins);
										const expectedMatches = placementSwiss
											? (placementMatchCounts[roundNumber]?.[record.key] ?? pairings.length)
											: Math.max(1, Math.floor(estimatedTeams / 2));
										return (
											<SwissPathCard
												key={`${roundNumber}-${record.key}`}
												record={record.key}
												pairings={pairings}
												placeholderCount={Math.max(0, expectedMatches - pairings.length)}
												next={
													placementNextLabels[`${roundNumber}:${record.key}`] ??
													(record.wins >= 0 ? nextRecordText(record.wins, record.losses, targetWins) : "Bilanzübergreifende Paarung")
												}
											/>
										);
									})}
								</div>
								{roundNumber < config.swissRounds ? (
									<div aria-hidden className="absolute -right-4 top-1/2 h-px w-4 bg-gradient-to-r from-cyan-200/45 to-lime-200/30" />
								) : null}
							</section>
						);
					})}
					<SwissOutcome config={config} />
				</div>
			</div>
			<footer className="grid gap-3 border-t border-white/8 px-6 py-5 text-xs leading-5 text-emerald-100/52 sm:grid-cols-3 sm:px-8">
				<div>
					<strong className="text-emerald-50">Zufall:</strong> Alle gültigen Paarungen haben bei jeder Ziehung eine neue Chance.
				</div>
				<div>
					<strong className="text-emerald-50">Harte Sperre:</strong> Kein Gegner darf innerhalb der Swiss Stage zweimal gespielt werden.
				</div>
				<div>
					<strong className="text-emerald-50">Freilos:</strong> Bei ungerader Teamzahl erhält zuerst ein Team mit den bisher wenigsten Freilosen den freien Slot.
				</div>
			</footer>
		</div>
	);
}

function SwissPathCard({ record, pairings, placeholderCount, next }: { record: string; pairings: SwissPairing[]; placeholderCount: number; next: string }) {
	const positive = record.startsWith("2-") || record.startsWith("3-");
	const danger = record.endsWith("-2") || record.endsWith("-3");
	return (
		<article
			className={`rounded-2xl border p-3 shadow-lg shadow-black/15 ${
				positive ? "border-lime-200/20 bg-lime-200/[0.065]" : danger ? "border-amber-200/18 bg-amber-200/[0.05]" : "border-white/10 bg-white/[0.045]"
			}`}
		>
			<div className="flex items-center justify-between gap-3">
				<span className="font-mono text-lg font-black text-cyan-100">{record.replaceAll("-", "–")}</span>
				<span className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-100/38">Score-Pool</span>
			</div>
			<div className="mt-2 grid gap-1.5">
				{pairings.map((pairing) => (
					<div
						key={pairing.id}
						className="grid min-h-9 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-white/[0.07] bg-black/24 px-2 py-2 text-[10px] font-black text-emerald-50"
					>
						<span className={`truncate text-right ${pairing.winnerTeamKey === pairing.teamAKey ? "text-lime-100" : ""}`}>{pairing.teamAName}</span>
						<span className="text-cyan-200/72">{pairing.bye ? "FREI" : "VS"}</span>
						<span className={`truncate ${pairing.winnerTeamKey === pairing.teamBKey ? "text-lime-100" : ""}`}>{pairing.teamBName ?? "Freilos"}</span>
					</div>
				))}
				{Array.from({ length: placeholderCount }, (_, index) => (
					<div
						key={`open-${index}`}
						className="grid min-h-9 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-dashed border-white/[0.07] bg-black/14 px-2 py-2 text-[10px] font-black text-emerald-100/30"
					>
						<span className="text-right">Offen</span>
						<span className="text-cyan-200/50">VS</span>
						<span>Offen</span>
					</div>
				))}
			</div>
			<div className="mt-2 border-t border-white/8 pt-2 text-[9px] font-black leading-4 text-emerald-100/48">{next}</div>
		</article>
	);
}

function SwissOutcome({ config }: { config: StageConfig }) {
	const allAdvance = config.advanceTeamCount >= config.teamCount;
	return (
		<section className="flex min-h-[34rem] flex-col rounded-[1.7rem] border border-lime-200/16 bg-gradient-to-b from-lime-200/[0.075] to-black/15 p-4">
			<div className="border-b border-lime-200/12 pb-3">
				<div className="text-[9px] font-black uppercase tracking-[0.22em] text-lime-100/50">Abschluss</div>
				<div className="mt-1 text-xl font-black text-lime-50">{allAdvance ? "Playoff-Seeds" : "Qualifiziert"}</div>
			</div>
			<div className="my-auto grid gap-2 py-4">
				{Array.from({ length: config.advanceTeamCount }, (_, index) => (
					<div key={index} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/18 px-3 py-2.5">
						<span className="font-mono text-sm font-black text-lime-100">#{index + 1}</span>
						<span className="text-[9px] font-black uppercase tracking-[0.13em] text-emerald-100/48">Qualifiziert</span>
					</div>
				))}
			</div>
			{!allAdvance ? (
				<div className="rounded-xl border border-amber-200/14 bg-amber-200/[0.05] px-3 py-3 text-center text-[9px] font-black uppercase tracking-[0.13em] text-amber-100/58">
					Platz {config.advanceTeamCount + 1}–{config.teamCount} ausgeschieden
				</div>
			) : null}
		</section>
	);
}

export function LegacySwissStageBoard({ config, teamNames }: { config: StageConfig; teamNames: string[] }) {
	if (config.teamCount === 8 && config.advanceTeamCount === 8) return <EightTeamPlacementSwiss teamNames={teamNames} />;

	const rounds = Math.max(1, config.swissRounds);
	const targetWins = Math.floor(rounds / 2) + 1;
	const hasPublishedTeams = teamNames.length > 0;

	return (
		<div className="relative overflow-hidden rounded-[2.4rem] border border-cyan-200/14 bg-[#07140e]/92 shadow-2xl shadow-black/30">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.1),transparent_25%),radial-gradient(circle_at_85%_80%,rgba(190,242,100,0.08),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_42%)]" />
			<div className="relative border-b border-white/8 px-6 py-6 sm:px-8">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<div className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-100/56">Tag 1 · Progression</div>
						<h2 className="mt-2 text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">Swiss Stage</h2>
					</div>
					<div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.15em]">
						<span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-emerald-100/62">{config.teamCount} Teams</span>
						<span className="rounded-full border border-cyan-200/18 bg-cyan-300/8 px-3 py-2 text-cyan-100">{rounds} Runden</span>
						<span className="rounded-full border border-lime-200/18 bg-lime-200/8 px-3 py-2 text-lime-100">Top {config.advanceTeamCount} weiter</span>
					</div>
				</div>
				{hasPublishedTeams ? (
					<div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
						{teamNames.map((team) => (
							<span key={team} className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[10px] font-black text-emerald-100/66">
								{team}
							</span>
						))}
					</div>
				) : null}
			</div>

			<div className="themed-scrollbar relative overflow-x-auto px-4 py-7 sm:px-6">
				<div className="grid min-w-max items-stretch gap-4" style={{ gridTemplateColumns: `repeat(${rounds}, minmax(13.5rem, 1fr)) minmax(14rem, 1fr)` }}>
					{Array.from({ length: rounds }, (_, roundIndex) => {
						const round = roundIndex + 1;
						const buckets = recordBuckets(round, targetWins);
						return (
							<section key={round} className="relative flex min-h-[31rem] flex-col rounded-[1.7rem] border border-white/8 bg-black/14 p-3">
								<div className="flex items-center justify-between border-b border-white/8 px-1 pb-3">
									<div>
										<div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-100/46">Runde</div>
										<div className="mt-0.5 text-xl font-black text-emerald-50">{String(round).padStart(2, "0")}</div>
									</div>
									<span className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/46">
										BO1
									</span>
								</div>
								<div className="flex flex-1 flex-col justify-around gap-3 py-3">
									{buckets.map((record) => {
										const estimatedTeams = round === 1 ? config.teamCount : estimateTeamsInRecord(config.teamCount, round - 1, record.wins);
										const estimatedMatches = Math.max(1, Math.floor(estimatedTeams / 2));
										return (
											<SwissRecordCard
												key={`${record.wins}-${record.losses}`}
												record={`${record.wins}–${record.losses}`}
												round={round}
												matches={Array.from({ length: Math.min(round === 1 ? 8 : 4, estimatedMatches) }, () => null)}
												muted={!hasPublishedTeams}
											/>
										);
									})}
								</div>
								{round < rounds ? <div aria-hidden className="absolute -right-4 top-1/2 h-px w-4 bg-gradient-to-r from-cyan-200/45 to-lime-200/30" /> : null}
							</section>
						);
					})}
					<section className="flex min-h-[31rem] flex-col gap-4 rounded-[1.7rem] border border-lime-200/14 bg-gradient-to-b from-lime-200/[0.07] to-black/15 p-4">
						<div className="border-b border-lime-200/12 pb-3">
							<div className="text-[9px] font-black uppercase tracking-[0.22em] text-lime-100/52">Ausgang</div>
							<div className="mt-1 text-xl font-black text-lime-50">Tag 2</div>
						</div>
						<div className="flex flex-1 flex-col justify-center gap-4">
							<OutcomeCard
								tone="advance"
								label="Playoffs"
								value={`Platz 1–${config.advanceTeamCount}`}
								detail={playoffFormatLabel(config.format) ?? "Format noch offen"}
							/>
							{config.teamCount > config.advanceTeamCount ? (
								<OutcomeCard
									tone="eliminated"
									label="Ausgeschieden"
									value={`Platz ${config.advanceTeamCount + 1}–${config.teamCount}`}
									detail="Turnier an Tag 1 beendet"
								/>
							) : null}
						</div>
					</section>
				</div>
			</div>

			<div className="relative grid gap-3 border-t border-white/8 px-6 py-5 text-xs leading-5 text-emerald-100/52 sm:grid-cols-3 sm:px-8">
				<div>
					<strong className="text-emerald-50">Paarungen:</strong> Teams mit gleicher oder möglichst ähnlicher Bilanz treffen aufeinander.
				</div>
				<div>
					<strong className="text-emerald-50">Schutz:</strong> Wiederholte Gegner werden vermieden; ungerade Score-Pools werden mit der nächstliegenden Bilanz gepaart.
				</div>
				<div>
					<strong className="text-emerald-50">Cutoff:</strong> Nach der letzten Runde ziehen die besten {config.advanceTeamCount} Teams weiter.
				</div>
			</div>
		</div>
	);
}

function EightTeamPlacementSwiss({ teamNames }: { teamNames: string[] }) {
	return (
		<div className="relative overflow-hidden rounded-[2.4rem] border border-cyan-200/14 bg-[#07140e]/92 shadow-2xl shadow-black/30">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(34,211,238,0.11),transparent_25%),radial-gradient(circle_at_82%_78%,rgba(190,242,100,0.09),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_42%)]" />
			<header className="relative border-b border-white/8 px-6 py-6 sm:px-8">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<div className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-100/56">8 Teams · Placement Swiss</div>
						<h2 className="mt-2 text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">Von 0–0 zu Seed #1–#8.</h2>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/56">
							Kein Team scheidet an Tag 1 aus. Jede Ergebnislinie bestimmt nur den Einstieg in das Playoff-Bracket.
						</p>
					</div>
					<span className="rounded-full border border-lime-200/20 bg-lime-200/9 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-lime-100">
						Alle 8 qualifiziert
					</span>
				</div>
				{teamNames.length ? (
					<div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
						{teamNames.map((team) => (
							<span key={team} className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[10px] font-black text-emerald-100/66">
								{team}
							</span>
						))}
					</div>
				) : null}
			</header>

			<div className="themed-scrollbar relative overflow-x-auto px-4 py-7 sm:px-6">
				<div className="grid w-full min-w-[72rem] grid-cols-[1fr_1fr_1.15fr_1fr_0.9fr] items-stretch gap-4">
					<PlacementRound number="01" subtitle="Alle starten 0–0">
						<PlacementBucket record="0–0" matches={4} next="Sieger → 1–0 · Verlierer → 0–1" />
					</PlacementRound>
					<PlacementRound number="02" subtitle="Erste Bilanzgruppen">
						<PlacementBucket record="1–0" matches={2} next="Sieger → 2–0 · Verlierer → 1–1" tone="positive" />
						<PlacementBucket record="0–1" matches={2} next="Sieger → 1–1 · Verlierer → 0–2" tone="danger" />
					</PlacementRound>
					<PlacementRound number="03" subtitle="Seeds und Mittelgruppe">
						<PlacementBucket record="2–0" matches={1} next="Sieger = Seed #1 · Verlierer = Seed #2" tone="qualified" />
						<PlacementBucket record="1–1" matches={2} next="Sieger → Spiel um #3/#4 · Verlierer → Spiel um #5/#6" />
						<PlacementBucket record="0–2" matches={1} next="Sieger = Seed #7 · Verlierer = Seed #8" tone="danger" />
					</PlacementRound>
					<PlacementRound number="04" subtitle="Mittlere Seeds">
						<PlacementBucket record="2–1" matches={1} next="Sieger = Seed #3 · Verlierer = Seed #4" tone="qualified" />
						<PlacementBucket record="1–2" matches={1} next="Sieger = Seed #5 · Verlierer = Seed #6" tone="danger" />
					</PlacementRound>
					<section className="rounded-[1.7rem] border border-lime-200/16 bg-gradient-to-b from-lime-200/[0.075] to-black/15 p-4">
						<div className="border-b border-lime-200/12 pb-3">
							<div className="text-[9px] font-black uppercase tracking-[0.22em] text-lime-100/50">Abschluss</div>
							<div className="mt-1 text-xl font-black text-lime-50">Qualifiziert</div>
						</div>
						<div className="mt-4 grid gap-2">
							{Array.from({ length: 8 }, (_, index) => (
								<div key={index} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/18 px-3 py-2">
									<span className="font-mono text-sm font-black text-lime-100">#{index + 1}</span>
									<span className="text-[9px] font-black uppercase tracking-[0.13em] text-emerald-100/48">Qualifiziert</span>
								</div>
							))}
						</div>
					</section>
				</div>
			</div>

			<footer className="relative grid gap-3 border-t border-white/8 px-6 py-5 text-xs leading-5 text-emerald-100/52 sm:grid-cols-3 sm:px-8">
				<div>
					<strong className="text-emerald-50">Runde 1–2:</strong> Teams wechseln anhand ihrer Bilanz in den nächsten Score-Pool.
				</div>
				<div>
					<strong className="text-emerald-50">Runde 3:</strong> Ungeschlagene und sieglose Teams erhalten ihre finalen Seeds.
				</div>
				<div>
					<strong className="text-emerald-50">Runde 4:</strong> Die Mittelgruppe spielt die Seeds #3 bis #6 vollständig aus.
				</div>
			</footer>
		</div>
	);
}

function PlacementRound({ number, subtitle, children }: { number: string; subtitle: string; children: ReactNode }) {
	return (
		<section className="relative flex min-h-[34rem] flex-col rounded-[1.7rem] border border-white/8 bg-black/14 p-3">
			<div className="flex items-center justify-between border-b border-white/8 px-1 pb-3">
				<div>
					<div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-100/46">Runde {number}</div>
					<div className="mt-1 text-xs font-black text-emerald-100/66">{subtitle}</div>
				</div>
				<span className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/46">BO1</span>
			</div>
			<div className="flex flex-1 flex-col justify-around gap-3 py-3">{children}</div>
			<div aria-hidden className="absolute -right-4 top-1/2 h-px w-4 bg-gradient-to-r from-cyan-200/45 to-lime-200/30" />
		</section>
	);
}

function PlacementBucket({ record, matches, next, tone = "neutral" }: { record: string; matches: number; next: string; tone?: "neutral" | "positive" | "qualified" | "danger" }) {
	const toneClass =
		tone === "qualified"
			? "border-lime-200/24 bg-lime-200/[0.08]"
			: tone === "positive"
				? "border-cyan-200/18 bg-cyan-300/[0.055]"
				: tone === "danger"
					? "border-orange-200/18 bg-orange-300/[0.05]"
					: "border-white/10 bg-white/[0.045]";
	return (
		<article className={`rounded-2xl border p-3 shadow-lg shadow-black/15 ${toneClass}`}>
			<div className="font-mono text-lg font-black text-cyan-100">{record}</div>
			<div className="mt-2 grid gap-1.5">
				{Array.from({ length: matches }, (_, index) => (
					<div
						key={index}
						className="grid min-h-8 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-white/[0.055] bg-black/18 px-2 py-1.5 text-[10px] font-black text-emerald-100/36"
					>
						<span className="text-right">Offen</span>
						<span className="text-cyan-200/72">VS</span>
						<span>Offen</span>
					</div>
				))}
			</div>
			<div className="mt-2 border-t border-white/8 pt-2 text-[9px] font-black leading-4 text-emerald-100/48">{next}</div>
		</article>
	);
}

function SwissRecordCard({ record, round, matches, muted }: { record: string; round: number; matches: Array<[string, string] | null>; muted: boolean }) {
	return (
		<article className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.055] to-black/10 p-3 shadow-lg shadow-black/15">
			<div className="flex items-center justify-between gap-2">
				<span className="font-mono text-lg font-black text-cyan-100">{record}</span>
				<span className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-100/34">R{round}</span>
			</div>
			<div className="mt-2 grid gap-1.5">
				{matches.map((match, index) => (
					<div
						key={index}
						className={`grid min-h-8 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-white/[0.055] bg-black/18 px-2 py-1.5 text-[10px] font-black ${muted ? "text-emerald-100/36" : "text-emerald-50"}`}
					>
						<span className="truncate text-right">{match?.[0] ?? "Offen"}</span>
						<span className="text-cyan-200/72">VS</span>
						<span className="truncate">{match?.[1] ?? "Offen"}</span>
					</div>
				))}
			</div>
		</article>
	);
}

function OutcomeCard({ tone, label, value, detail }: { tone: "advance" | "eliminated"; label: string; value: string; detail: string }) {
	return (
		<div className={`rounded-2xl border p-4 ${tone === "advance" ? "border-lime-200/24 bg-lime-200/10" : "border-orange-200/18 bg-orange-300/[0.07]"}`}>
			<div className={`text-[9px] font-black uppercase tracking-[0.2em] ${tone === "advance" ? "text-lime-100/60" : "text-orange-100/58"}`}>{label}</div>
			<div className="mt-2 text-xl font-black text-emerald-50">{value}</div>
			<div className="mt-1 text-[11px] font-bold text-emerald-100/50">{detail}</div>
		</div>
	);
}

export function GroupStagePlan({ config, teamNames }: { config: StageConfig; teamNames: string[] }) {
	const groupCount = Math.max(1, config.groupCount);
	const teams = Array.from({ length: config.teamCount }, (_, index) => teamNames[index] ?? `Team ${index + 1}`);
	const groups = Array.from({ length: groupCount }, (_, groupIndex) => ({
		name: String.fromCharCode(65 + groupIndex),
		teams: teams.filter((_, teamIndex) => teamIndex % groupCount === groupIndex),
	}));

	return (
		<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
			{groups.map((group) => (
				<article key={group.name} className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/20">
					<div className="flex items-center justify-between border-b border-white/8 bg-gradient-to-r from-lime-200/[0.09] to-cyan-300/[0.035] px-5 py-4">
						<div>
							<div className="text-[9px] font-black uppercase tracking-[0.24em] text-lime-100/50">Gruppe</div>
							<div className="mt-1 text-3xl font-black text-lime-100">{group.name}</div>
						</div>
						<span className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/54">
							{config.groupRoundRobinLegs === 2 ? "Hin & Rück" : "Round Robin"}
						</span>
					</div>
					<div className="p-3">
						{group.teams.map((team, index) => (
							<div key={team} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-white/[0.055] px-3 py-3 last:border-0">
								<span
									className={`grid size-7 place-items-center rounded-lg text-xs font-black ${index < Math.ceil(config.advanceTeamCount / groupCount) ? "bg-lime-200/12 text-lime-100" : "bg-black/20 text-emerald-100/38"}`}
								>
									{index + 1}
								</span>
								<span className="truncate text-sm font-black text-emerald-50">{team}</span>
								<span className="font-mono text-xs font-black text-emerald-100/34">0–0</span>
							</div>
						))}
					</div>
				</article>
			))}
		</div>
	);
}

export function SwissPlayoffSeedBracket({ format, teamCount = 8 }: { format: StageConfig["format"]; teamCount?: number }) {
	const isLight = format === "double-elimination-light";
	const isSixTeamLight = isLight && teamCount === 6;
	const isFourTeamBracket = teamCount === 4;
	return (
		<div className="overflow-hidden rounded-[2.4rem] border border-lime-200/14 bg-[#07140e]/92 shadow-2xl shadow-black/30">
			<div className="border-b border-white/8 bg-gradient-to-r from-lime-200/[0.075] via-transparent to-cyan-300/[0.045] px-6 py-5">
				<div className="text-[10px] font-black uppercase tracking-[0.28em] text-lime-100/52">Seeded Bracket · Tag 2</div>
				<h2 className="mt-2 text-3xl font-black text-emerald-50">
					{isSixTeamLight
						? "Vier starten oben. Zwei steigen unten ein."
						: isLight
							? "Vorteil für die Top-Seeds."
							: isFourTeamBracket
								? "#1 gegen #4. #2 gegen #3."
								: "#1 gegen #8. #2 gegen #7."}
				</h2>
			</div>
			{isSixTeamLight ? (
				<div className="grid gap-4 p-5 lg:grid-cols-2">
					<SeedEntryGroup title="Upper-Halbfinals" accent="lime" detail="Alle vier Teams besitzen zwei Leben">
						<SeedMatch first={1} second={4} />
						<SeedMatch first={2} second={3} />
					</SeedEntryGroup>
					<SeedEntryGroup title="Lower-Einstieg" accent="amber" detail="#5 und #6 treffen auf die Upper-Verlierer">
						<SeedDestination seed={5} destination="Lower Runde 1 · Match 1" />
						<SeedDestination seed={6} destination="Lower Runde 1 · Match 2" />
					</SeedEntryGroup>
				</div>
			) : isLight ? (
				<div className="grid gap-4 p-5 lg:grid-cols-3">
					<SeedEntryGroup title="Upper-Freilos" accent="lime" detail="Direkt im Upper-Halbfinale">
						<SeedDestination seed={1} destination="Upper Halbfinale 2" />
						<SeedDestination seed={2} destination="Upper Halbfinale 1" />
					</SeedEntryGroup>
					<SeedEntryGroup title="Upper Runde 1" accent="cyan" detail="Sieger treffen auf #1 und #2">
						<SeedMatch first={3} second={6} />
						<SeedMatch first={4} second={5} />
					</SeedEntryGroup>
					<SeedEntryGroup title="Lower-Einstieg" accent="amber" detail="Eine Niederlage beendet das Turnier">
						<SeedDestination seed={7} destination="Lower Runde 1" />
						<SeedDestination seed={8} destination="Lower Runde 1" />
					</SeedEntryGroup>
				</div>
			) : isFourTeamBracket ? (
				<div className="grid gap-5 p-5 lg:grid-cols-2">
					<BracketHalf title="Obere Hälfte" accent="lime" quarterfinals={[[1, 4]]} semifinal="Sieger erreicht das Upper Final" />
					<BracketHalf title="Untere Hälfte" accent="cyan" quarterfinals={[[2, 3]]} semifinal="Sieger erreicht das Upper Final" />
				</div>
			) : (
				<div className="grid gap-5 p-5 lg:grid-cols-2">
					<BracketHalf
						title="Obere Hälfte"
						accent="lime"
						quarterfinals={[
							[1, 8],
							[4, 5],
						]}
						semifinal="Sieger #1/#8 vs Sieger #4/#5"
					/>
					<BracketHalf
						title="Untere Hälfte"
						accent="cyan"
						quarterfinals={[
							[2, 7],
							[3, 6],
						]}
						semifinal="Sieger #2/#7 vs Sieger #3/#6"
					/>
				</div>
			)}
			<div className="grid gap-3 border-t border-white/8 px-6 py-5 text-xs leading-6 text-emerald-100/54 md:grid-cols-2">
				<div>
					<strong className="text-emerald-50">Seeding:</strong>{" "}
					{isLight
						? "Die Platzierung an Tag 1 bestimmt den Einstieg und damit die Zahl der verbleibenden Leben."
						: "Die Platzierung an Tag 1 bestimmt die erste Playoff-Runde."}
				</div>
				<div>
					<strong className="text-emerald-50">{playoffFormatLabel(format) ? `${playoffFormatLabel(format)}:` : "Format offen:"}</strong>{" "}
					{format === "double-elimination" || format === "double-elimination-light"
						? "Eine Niederlage im Upper führt ins Lower Bracket. Das Grand Final ist ein einziges Do-or-die-Match ohne Reset."
						: format === "single-elimination"
							? "Eine Niederlage beendet das Turnier."
							: "Der genaue Playoff-Ablauf wird noch festgelegt."}
				</div>
			</div>
		</div>
	);
}

function SeedEntryGroup({ title, accent, detail, children }: { title: string; accent: "lime" | "cyan" | "amber"; detail: string; children: ReactNode }) {
	const tone = {
		lime: "border-lime-200/20 bg-lime-200/[0.065] text-lime-100",
		cyan: "border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100",
		amber: "border-amber-200/20 bg-amber-200/[0.06] text-amber-100",
	}[accent];
	return (
		<section className={`rounded-[1.8rem] border p-4 ${tone}`}>
			<div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-65">{title}</div>
			<div className="mt-1 text-[11px] font-bold text-emerald-100/48">{detail}</div>
			<div className="mt-4 grid gap-3">{children}</div>
		</section>
	);
}

function SeedDestination({ seed, destination }: { seed: number; destination: string }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
			<span className="text-sm font-black text-emerald-50">Seed #{seed}</span>
			<span className="text-[10px] font-black uppercase tracking-[0.13em] opacity-62">{destination}</span>
		</div>
	);
}

function BracketHalf({ title, accent, quarterfinals, semifinal }: { title: string; accent: "lime" | "cyan"; quarterfinals: number[][]; semifinal: string }) {
	const accentClass = accent === "lime" ? "border-lime-200/20 bg-lime-200/[0.065] text-lime-100" : "border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100";
	return (
		<section className={`rounded-[1.8rem] border p-4 ${accentClass}`}>
			<div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-65">{title}</div>
			<div className="mt-4 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
				<div className="grid gap-3">
					{quarterfinals.map(([first, second]) => (
						<SeedMatch key={`${first}-${second}`} first={first} second={second} />
					))}
				</div>
				<div aria-hidden className="hidden items-center sm:flex">
					<span className="h-16 w-px bg-current opacity-20" />
					<span className="h-px w-5 bg-current opacity-30" />
				</div>
				<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
					<div className="text-[9px] font-black uppercase tracking-[0.18em] opacity-50">Halbfinale</div>
					<div className="mt-2 text-xs font-black leading-5 text-emerald-50">{semifinal}</div>
				</div>
			</div>
		</section>
	);
}

function SeedMatch({ first, second }: { first: number; second: number }) {
	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-black text-emerald-50">
			<span className="text-right">Seed #{first}</span>
			<span className="text-lime-200/70">VS</span>
			<span>Seed #{second}</span>
		</div>
	);
}
