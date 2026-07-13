"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { SwissStageState } from "@/lib/tournament-swiss";

export function SwissLivePairings({ initialState, configuredRounds, live }: { initialState: SwissStageState; configuredRounds: number; live: boolean }) {
	const [state, setState] = useState(initialState);
	const refresh = useEffectEvent(async () => {
		const response = await fetch("/api/tournament/swiss");
		const json = (await response.json().catch(() => null)) as { state?: SwissStageState } | null;
		if (response.ok && json?.state && json.state.updatedAt !== state.updatedAt) setState(json.state);
	});
	const complete = state.rounds.length >= configuredRounds;

	useEffect(() => {
		if (!live || complete) return;
		const timer = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, 3000);
		return () => window.clearInterval(timer);
	}, [complete, live]);

	if (!state.rounds.length)
		return (
			<div className="rounded-2xl border border-dashed border-cyan-200/14 bg-cyan-300/[0.035] px-5 py-6 text-center text-sm font-bold text-cyan-50/55">
				Die erste Runde wurde noch nicht ausgelost.
			</div>
		);
	return (
		<section className="overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[#07160f]/88 shadow-xl shadow-black/22">
			<header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
				<div>
					<div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-100/52">Veröffentlichte Auslosung</div>
					<h2 className="mt-1 text-xl font-black text-emerald-50">Aktuelle Swiss-Paarungen</h2>
				</div>
				{live && !complete ? (
					<span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-red-100/64">
						<span className="size-2 animate-pulse rounded-full bg-red-300" /> Live
					</span>
				) : null}
			</header>
			<div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
				{state.rounds.map((round) => (
					<article key={round.round} className="rounded-2xl border border-white/9 bg-black/18 p-3">
						<div className="flex items-center justify-between">
							<strong className="text-sm text-emerald-50">Runde {round.round}</strong>
							<span className="text-[9px] font-black uppercase tracking-[0.13em] text-cyan-100/40">Zufällig gezogen</span>
						</div>
						<div className="mt-3 grid gap-1.5">
							{round.pairings.map((pairing) => (
								<div
									key={pairing.id}
									className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-2 text-[10px] font-black text-emerald-100/72"
								>
									<span className="truncate text-right">{pairing.teamAName}</span>
									<span className="text-cyan-200/62">{pairing.bye ? "FREILOS" : "VS"}</span>
									<span className="truncate">{pairing.teamBName ?? "—"}</span>
								</div>
							))}
						</div>
					</article>
				))}
			</div>
		</section>
	);
}
