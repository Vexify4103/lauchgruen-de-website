"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 20_000;

export function TournamentLiveRefresh() {
	const router = useRouter();

	useEffect(() => {
		let timer: ReturnType<typeof setInterval> | null = null;

		const start = () => {
			if (timer) return;
			timer = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
		};
		const stop = () => {
			if (!timer) return;
			clearInterval(timer);
			timer = null;
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				router.refresh();
				start();
			} else {
				stop();
			}
		};

		start();
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			stop();
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [router]);

	return null;
}
