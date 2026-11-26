"use client";

import { useEffect, useState } from "react";
import type { PublicChallenge, PublicGameState, PublicTeam } from "@/lib/winchallenge/view";

const POLL_MS = 5000;

/** Polls the public challenge every 5 s while the tab is visible; `elapsed` runs locally between polls. */
export function usePublicChallenge(initial: PublicChallenge | null) {
	const [data, setData] = useState(initial);
	const [received, setReceived] = useState(0);
	const [now, setNow] = useState(0);

	useEffect(() => {
		// Server and first client render both show the snapshot; the local clock starts after mount.
		const mountedAt = Date.now();
		setReceived(mountedAt);
		setNow(mountedAt);
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
	const playTime = (game: PublicGameState) => (game.playing ? game.playMs + Math.max(0, now - received) : game.playMs);
	return { data, elapsed, playTime };
}

export const TEAM_STATUS_LABEL: Record<PublicTeam["status"], string> = {
	forming: "sucht Partner",
	ready: "bereit",
	running: "läuft",
	paused: "Pause",
	finished: "fertig",
	"gave-up": "aufgegeben",
};
