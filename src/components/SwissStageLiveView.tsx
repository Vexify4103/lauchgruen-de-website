"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { TournamentSettings } from "@/lib/tournament-settings";
import type { SwissStageState } from "@/lib/tournament-swiss";
import { resolveSwissFocusRound } from "@/lib/tournament-stage-focus";
import { SwissStageBoard } from "@/components/SwissStageBoard";

export function SwissStageLiveView({
	initialState,
	config,
	teamNames,
	live,
	tags,
	statuses,
}: {
	initialState: SwissStageState;
	config: TournamentSettings["structure"];
	teamNames: string[];
	live: boolean;
	tags?: Record<string, string>;
	statuses?: Record<string, string>;
}) {
	const [state, setState] = useState(initialState);
	const complete = state.rounds.length >= config.swissRounds;
	const activeRound = resolveSwissFocusRound(state.rounds, config.swissRounds);
	const refresh = useEffectEvent(async () => {
		const response = await fetch("/api/tournament/swiss");
		const json = (await response.json().catch(() => null)) as { state?: SwissStageState } | null;
		if (response.ok && json?.state) setState((current) => (json.state?.updatedAt === current.updatedAt ? current : json.state!));
	});

	useEffect(() => {
		if (!live || complete) return;
		const timer = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, 3000);
		return () => window.clearInterval(timer);
	}, [complete, live]);

	return (
		<div className="mt-9">
			<SwissStageBoard config={config} teamNames={teamNames} state={state} activeRound={activeRound} tags={tags} statuses={statuses} />
		</div>
	);
}
