"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PLAY_IN_RESET_CONFIRMATION } from "@/lib/tournament-structure";

export type StagePlayInPair = { matchId: string; teamAName: string; teamBName: string; winner: string | null; score: string | null; status: string };
export type StageTie = { key: string; title: string; teams: string[] };
export type StageDecision = { key: string; title: string; order: string[] };

/**
 * Live-Cockpit controls for the stage flow: create and reset the play-in and settle ties that no
 * configured tiebreaker splits (usually after a tiebreaker match).
 */
export function StageControlPanel({
	pendingReason,
	playIn,
	ties,
	decisions,
}: {
	pendingReason: string | null;
	playIn: { required: number; pairs: StagePlayInPair[] | null; candidates: Array<{ key: string; name: string }> } | null;
	ties: StageTie[];
	decisions: StageDecision[];
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [selection, setSelection] = useState<string[]>([]);
	const [resetOpen, setResetOpen] = useState(false);
	const [tieOrders, setTieOrders] = useState<Record<string, string[]>>(() => Object.fromEntries(ties.map((tie) => [tieId(tie), tie.teams])));

	function send(url: string, body: unknown, success: string) {
		setMessage("");
		setError("");
		startTransition(async () => {
			const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) {
				setError(json?.message ?? "Aktion fehlgeschlagen.");
				return;
			}
			setMessage(success);
			setSelection([]);
			router.refresh();
		});
	}

	function toggleCandidate(key: string) {
		setSelection((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : current.length < (playIn?.required ?? 0) ? [...current, key] : current));
	}

	function moveTeam(id: string, index: number, direction: -1 | 1) {
		setTieOrders((current) => {
			const order = [...(current[id] ?? [])];
			const target = index + direction;
			if (target < 0 || target >= order.length) return current;
			[order[index], order[target]] = [order[target], order[index]];
			return { ...current, [id]: order };
		});
	}

	function saveTie(tie: StageTie) {
		const order = tieOrders[tieId(tie)] ?? tie.teams;
		// Keep earlier decisions of the same table and replace only this tie.
		const existing = decisions.find((decision) => decision.key === tie.key)?.order.filter((name) => !tie.teams.includes(name)) ?? [];
		send("/api/tournament/standings", { key: tie.key, order: [...existing, ...order] }, `${tie.title}: Reihenfolge gespeichert.`);
	}

	const selectedNames = selection.map((key) => playIn?.candidates.find((team) => team.key === key)?.name ?? key);
	const previewPairs = Array.from(
		{ length: Math.floor(selectedNames.length / 2) },
		(_, index) => `${selectedNames[index]} gegen ${selectedNames[selectedNames.length - 1 - index]}`
	);

	if (!pendingReason && !playIn && ties.length === 0 && decisions.length === 0) return null;

	return (
		<section className="mb-5 overflow-hidden rounded-[2rem] border border-lime-200/14 bg-[#08160f]/90 shadow-xl shadow-black/24">
			<header className="border-b border-white/8 px-5 py-4">
				<div className="text-[9px] font-black uppercase tracking-[0.25em] text-lime-100/58">Turnierablauf</div>
				<h2 className="mt-1 text-2xl font-black text-emerald-50">Stages & Entscheidungen</h2>
				{pendingReason ? <p className="mt-2 text-sm font-bold text-amber-100/80">{pendingReason}</p> : null}
			</header>
			<div className="grid gap-4 p-5 lg:grid-cols-2">
				{playIn ? (
					<div className="rounded-2xl border border-white/9 bg-black/18 p-4">
						<h3 className="text-sm font-black uppercase tracking-[0.14em] text-lime-100/80">Play-in · {playIn.required} Teams</h3>
						{playIn.pairs ? (
							<>
								<ul className="mt-3 grid gap-2">
									{playIn.pairs.map((pair) => (
										<li
											key={pair.matchId}
											className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm"
										>
											<span className="font-bold text-emerald-50">
												{pair.teamAName} <span className="text-emerald-100/40">vs</span> {pair.teamBName}
											</span>
											<span className="text-[11px] font-black uppercase tracking-[0.1em] text-emerald-100/56">
												{pair.winner ? `${pair.winner} weiter · ${pair.score}` : pair.status}
											</span>
										</li>
									))}
								</ul>
								<button
									type="button"
									disabled={pending}
									onClick={() => setResetOpen(true)}
									className="mt-3 rounded-xl border border-red-300/18 bg-red-500/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-red-100 disabled:opacity-40"
								>
									Play-in zurücksetzen
								</button>
							</>
						) : (
							<>
								<p className="mt-2 text-xs leading-5 text-emerald-100/54">
									Wähle die Play-in-Teams vom stärksten zum schwächsten. Gepaart wird Erster gegen Letzten, Zweiter gegen Vorletzten und so weiter.
								</p>
								<div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Play-in-Teams auswählen">
									{playIn.candidates.map((team) => {
										const position = selection.indexOf(team.key);
										return (
											<button
												key={team.key}
												type="button"
												aria-pressed={position >= 0}
												onClick={() => toggleCandidate(team.key)}
												className={`rounded-full border px-3 py-1.5 text-xs font-bold ${position >= 0 ? "border-lime-200/40 bg-lime-200/16 text-lime-50" : "border-white/10 bg-black/20 text-emerald-100/64"}`}
											>
												{position >= 0 ? `${position + 1}. ` : ""}
												{team.name}
											</button>
										);
									})}
								</div>
								{previewPairs.length ? <p className="mt-3 text-xs font-bold text-cyan-100/70">{previewPairs.join(" · ")}</p> : null}
								<button
									type="button"
									disabled={pending || selection.length !== playIn.required}
									onClick={() => send("/api/tournament/play-in", { action: "create", teamKeys: selection }, "Play-in erstellt.")}
									className="mt-3 rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-40"
								>
									Play-in erstellen ({selection.length}/{playIn.required})
								</button>
							</>
						)}
					</div>
				) : null}

				{ties.map((tie) => {
					const id = tieId(tie);
					const order = tieOrders[id] ?? tie.teams;
					return (
						<div key={id} className="rounded-2xl border border-amber-200/18 bg-amber-200/[0.05] p-4">
							<h3 className="text-sm font-black uppercase tracking-[0.14em] text-amber-100/86">Gleichstand · {tie.title}</h3>
							<p className="mt-2 text-xs leading-5 text-emerald-100/56">
								Kein eingestellter Tiebreaker trennt diese Teams. Lege die Reihenfolge nach dem Tiebreaker-Match fest (oben = besser).
							</p>
							<ol className="mt-3 grid gap-2">
								{order.map((name, index) => (
									<li
										key={name}
										className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm font-bold text-emerald-50"
									>
										<span>
											{index + 1}. {name}
										</span>
										<span className="flex gap-1">
											<button
												type="button"
												aria-label={`${name} nach oben`}
												onClick={() => moveTeam(id, index, -1)}
												disabled={index === 0}
												className="rounded-md border border-white/10 px-2 py-0.5 disabled:opacity-30"
											>
												↑
											</button>
											<button
												type="button"
												aria-label={`${name} nach unten`}
												onClick={() => moveTeam(id, index, 1)}
												disabled={index === order.length - 1}
												className="rounded-md border border-white/10 px-2 py-0.5 disabled:opacity-30"
											>
												↓
											</button>
										</span>
									</li>
								))}
							</ol>
							<button
								type="button"
								disabled={pending}
								onClick={() => saveTie(tie)}
								className="mt-3 rounded-xl bg-gradient-to-r from-amber-200 to-lime-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-40"
							>
								Reihenfolge festlegen
							</button>
						</div>
					);
				})}

				{decisions.map((decision) => (
					<div key={decision.key} className="rounded-2xl border border-white/9 bg-black/18 p-4">
						<h3 className="text-sm font-black uppercase tracking-[0.14em] text-emerald-100/70">Entscheidung · {decision.title}</h3>
						<p className="mt-2 text-sm font-bold text-emerald-50">{decision.order.join(" > ")}</p>
						<button
							type="button"
							disabled={pending}
							onClick={() => send("/api/tournament/standings", { key: decision.key, order: null }, `${decision.title}: Entscheidung entfernt.`)}
							className="mt-3 rounded-xl border border-white/12 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/70 disabled:opacity-40"
						>
							Entscheidung entfernen
						</button>
					</div>
				))}
			</div>
			{message || error ? (
				<div
					role={error ? "alert" : "status"}
					className={`mx-5 mb-5 rounded-xl border px-3 py-2 text-xs font-bold ${error ? "border-red-300/24 bg-red-500/10 text-red-100" : "border-lime-200/20 bg-lime-200/8 text-lime-50"}`}
				>
					{error || message}
				</div>
			) : null}
			<ConfirmDialog
				open={resetOpen}
				title="Play-in zurücksetzen?"
				description="Die Play-in-Paarungen werden gelöscht. Das geht nur, solange noch kein Play-in-Match begonnen hat."
				confirmLabel="Play-in zurücksetzen"
				tone="danger"
				onConfirm={() => {
					setResetOpen(false);
					send("/api/tournament/play-in", { action: "reset", confirmation: PLAY_IN_RESET_CONFIRMATION }, "Play-in zurückgesetzt.");
				}}
				onCancel={() => setResetOpen(false)}
			/>
		</section>
	);
}

function tieId(tie: StageTie) {
	return `${tie.key}:${[...tie.teams].sort().join("|")}`;
}
