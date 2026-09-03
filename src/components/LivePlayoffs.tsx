"use client";

import { useEffect, useState } from "react";
import { BracketTree, type BracketMatch } from "@/components/BracketTree";

const POLL_INTERVAL_MS = 15_000;

export type LivePlayoffMatch = BracketMatch;

export function LivePlayoffs({ initialMatches, autoRefresh = true, showPools = true }: { initialMatches: LivePlayoffMatch[]; autoRefresh?: boolean; showPools?: boolean }) {
	const [matches, setMatches] = useState(initialMatches);
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);

	useEffect(() => {
		if (!autoRefresh) return;
		let cancelled = false;
		const markUpdated = () => setLastUpdated(new Date().toLocaleTimeString("de-DE"));

		markUpdated();

		const fetchOnce = async () => {
			try {
				const response = await fetch("/api/tournament/bracket", {
					cache: "no-store",
				});
				if (!response.ok) return;
				const json = (await response.json()) as { matches: LivePlayoffMatch[] };
				if (cancelled || !Array.isArray(json.matches)) return;
				setMatches(json.matches);
				markUpdated();
			} catch {
				// Quiet failure — next tick will retry.
			}
		};

		// Pause polling when the tab is hidden — no point burning battery / requests.
		let timer: ReturnType<typeof setInterval> | null = null;
		const start = () => {
			if (timer) return;
			timer = setInterval(fetchOnce, POLL_INTERVAL_MS);
		};
		const stop = () => {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		};

		const onVisibility = () => {
			if (document.visibilityState === "visible") {
				// Fetch once immediately so a returning viewer doesn't wait 15s.
				void fetchOnce();
				start();
			} else {
				stop();
			}
		};

		start();
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			cancelled = true;
			stop();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [autoRefresh]);

	return (
		<div>
			<BracketTree matches={matches} showPools={showPools} />
			{autoRefresh ? (
				<div className="mt-3 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100/40">
					Live-Aktualisierung{lastUpdated ? ` · zuletzt ${lastUpdated}` : ""}
				</div>
			) : null}
		</div>
	);
}
