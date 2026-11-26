"use client";

import { useEffect, useState } from "react";
import type { PublicChallenge, PublicTeam } from "@/lib/winchallenge/view";

const POLL_MS = 5000;

/** Polls the public challenge every 5 s while the tab is visible; `elapsed` runs locally between polls. */
export function usePublicChallenge(initial: PublicChallenge | null) {
	const [data, setData] = useState(initial);
	const [received, setReceived] = useState(() => Date.now());
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		async function poll() {
			if (document.visibilityState !== "visible") return;
			try {
				const response = await fetch("/api/winchallenge", { cache: "no-store" });
				if (!response.ok) return;
				setData(await response.json());
				setReceived(Date.now());
			} catch {
				// Keep the last state.
			}
		}
		const pollTimer = window.setInterval(poll, POLL_MS);
		const tick = window.setInterval(() => setNow(Date.now()), 1000);
		return () => {
			window.clearInterval(pollTimer);
			window.clearInterval(tick);
		};
	}, []);

	const elapsed = (team: PublicTeam) => (team.running ? team.elapsedMs + Math.max(0, now - received) : team.elapsedMs);
	return { data, elapsed };
}

export const TEAM_STATUS_LABEL: Record<PublicTeam["status"], string> = {
	forming: "sucht Partner",
	ready: "bereit",
	running: "läuft",
	paused: "Pause",
	finished: "fertig",
	"gave-up": "aufgegeben",
};
