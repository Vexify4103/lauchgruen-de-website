"use client";

import { useEffect, useRef } from "react";

export function StageMatchAutoFocus({ matchId }: { matchId: string | null }) {
	const lastFocused = useRef<string | null>(null);

	useEffect(() => {
		if (!matchId || lastFocused.current === matchId) return;
		let frame = window.requestAnimationFrame(() => {
			frame = window.requestAnimationFrame(() => {
				const target = document.querySelector<HTMLElement>(`[data-stage-match-id="${CSS.escape(matchId)}"]`);
				if (!target) return;
				target.scrollIntoView({
					block: "center",
					inline: "nearest",
					behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
				});
				lastFocused.current = matchId;
			});
		});
		return () => window.cancelAnimationFrame(frame);
	}, [matchId]);

	return null;
}
