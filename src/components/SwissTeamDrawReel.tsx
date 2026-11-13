"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { DRAW_REEL_BRAKE_DELAYS, DRAW_REEL_REVEAL_HOLD_MS, drawReelBrakeTeam, drawReelIntroSteps, drawReelTeam } from "@/lib/swiss-draw-reel";
import { slotLetter } from "@/lib/swiss-pot-draw";

export type TeamDrawReveal = {
	id: number;
	round: number;
	record: string;
	slot: number;
	candidates: { key: string; name: string }[];
	winner?: string;
	assignedSlot?: number;
	message?: string;
};

export function SwissTeamDrawReel({ draw, onComplete }: { draw: TeamDrawReveal; onComplete: () => void }) {
	const [frame, setFrame] = useState({ key: draw.candidates[0].key, step: 0, revealed: false, shown: false });
	const result = useEffectEvent(() => draw.winner);
	const complete = useEffectEvent(() => onComplete());
	useEffect(() => {
		const keys = draw.candidates.map((team) => team.key);
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const single = keys.length === 1;
		const start = Math.floor(Math.random() * keys.length);
		let timer = 0,
			step = 0,
			brake = 0,
			cancelled = false;
		function tick() {
			if (cancelled) return;
			const winner = result();
			if ((single || reducedMotion) && winner) {
				setFrame({ key: winner, step, revealed: true, shown: true });
				timer = window.setTimeout(() => {
					if (!cancelled) complete();
				}, DRAW_REEL_REVEAL_HOLD_MS);
				return;
			}
			if (winner && step >= drawReelIntroSteps(keys.length)) {
				if (brake === DRAW_REEL_BRAKE_DELAYS.length) {
					complete();
					return;
				}
				setFrame({ key: drawReelBrakeTeam(keys, winner, brake), step: step++, revealed: brake === DRAW_REEL_BRAKE_DELAYS.length - 1, shown: true });
				timer = window.setTimeout(tick, DRAW_REEL_BRAKE_DELAYS[brake++]);
				return;
			}
			if (!reducedMotion) setFrame({ key: drawReelTeam(keys, step, start), step, revealed: false, shown: true });
			step++;
			timer = window.setTimeout(tick, reducedMotion ? 100 : 60);
		}
		timer = window.setTimeout(tick, single || reducedMotion ? 650 : 0);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [draw.id, draw.candidates]);

	const index = draw.candidates.findIndex((team) => team.key === frame.key);
	const current = draw.candidates[index];
	return (
		<span className={`team-draw-reel${frame.revealed ? " is-settled" : ""}`} aria-label={`Teamziehung für Slot ${slotLetter(draw.slot)}`}>
			<span className="team-draw-reel-window" aria-hidden="true">
				<span key={frame.step} className="team-draw-reel-track">
					{/* With reduced motion no name shows until the server result arrives, so no team looks drawn early. A single-team pool may show its only candidate. */}
					<strong>{frame.shown ? current.name : "…"}</strong>
				</span>
			</span>
			<span className="sr-only" role="status">
				{frame.revealed ? `${current.name} gezogen für Slot ${slotLetter(draw.assignedSlot ?? draw.slot)}` : "Die Lostrommel läuft"}
			</span>
		</span>
	);
}
