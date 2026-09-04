"use client";

import { useEffect, useRef, useState } from "react";
import type { LauchgruenObsResponse } from "@/lib/streamer-obs";
import { AkumaOverlay } from "@/components/obs/akuma/AkumaOverlay";
import { HippokrateOverlay } from "@/components/obs/hippokrate/HippokrateOverlay";
import { LauchgruenOverlay } from "@/components/obs/lauchgruen/LauchgruenOverlay";
import { LauchgruenSmallOverlay } from "@/components/obs/lauchgruen/LauchgruenSmallOverlay";
import { N4cht4r4Overlay } from "@/components/obs/n4cht4r4/N4cht4r4Overlay";
import { NachtdienstOverlay } from "@/components/obs/nachtdienst/NachtdienstOverlay";
import { germanTierName, lpTone, overlaySignature } from "@/components/obs/shared/utils";

const POLL_INTERVAL_MS = 20_000;

export type StreamerOverlayLayout = "default" | "hippokrate" | "nachtdienst" | "akuma" | "n4cht4r4";

export function StreamerPerformanceOverlay({
	initial,
	variant = "full",
	endpoint = "/api/obs/lauchgruen",
	layout = "default",
	forceVisible = false,
}: {
	initial: LauchgruenObsResponse;
	variant?: "full" | "small";
	endpoint?: string;
	layout?: StreamerOverlayLayout;
	forceVisible?: boolean;
}) {
	const [data, setData] = useState(initial);
	const [pulseKey, setPulseKey] = useState(0);
	const [displayDurationSeconds, setDisplayDurationSeconds] = useState(initial.streamDurationSeconds);
	const lastSignature = useRef(overlaySignature(initial));

	useEffect(() => {
		let cancelled = false;
		const refresh = async () => {
			try {
				const response = await fetch(endpoint, { cache: "no-store" });
				if (!response.ok) return;
				const nextData = (await response.json()) as LauchgruenObsResponse;
				if (cancelled) return;
				const signature = overlaySignature(nextData);
				if (signature !== lastSignature.current) {
					lastSignature.current = signature;
					setPulseKey((key) => key + 1);
				}
				setData(nextData);
			} catch {
				// OBS keeps polling; transient API errors must not flash the source.
			}
		};

		const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [endpoint]);

	useEffect(() => {
		if (!data.online) return;
		const baselineDuration = data.streamDurationSeconds;
		const baselineTime = Date.now();
		const updateDuration = () => {
			setDisplayDurationSeconds(baselineDuration + Math.floor((Date.now() - baselineTime) / 1_000));
		};
		const initialUpdate = window.setTimeout(updateDuration, 0);
		const timer = window.setInterval(updateDuration, 1_000);
		return () => {
			window.clearTimeout(initialUpdate);
			window.clearInterval(timer);
		};
	}, [data.online, data.streamDurationSeconds]);

	const tone = lpTone(data.lpDelta);
	const title = data.rank ? `Aufstieg zu ${germanTierName(data.rank.nextTierLabel.split(" ")[0])}` : "Aufstieg in die Rangliste";
	const rankProgress = data.rank?.tierProgressPercent ?? 0;

	if (layout === "nachtdienst") {
		const rankedQueueLive = data.liveQueueId === 420 || data.liveQueueId === 440;
		if (!forceVisible && (!data.leagueLive || !rankedQueueLive)) return null;
		return <NachtdienstOverlay key={pulseKey} data={data} />;
	}
	if (layout === "akuma") {
		if (!forceVisible && !data.leagueLive) return null;
		return <AkumaOverlay key={pulseKey} data={data} />;
	}
	if (layout === "n4cht4r4") {
		if (!forceVisible && !data.leagueLive) return null;
		return <N4cht4r4Overlay key={pulseKey} data={data} />;
	}
	if (!forceVisible && data.online && !data.leagueLive) return null;
	if (layout === "hippokrate") return <HippokrateOverlay data={data} lpTone={tone} />;
	if (variant === "small") return <LauchgruenSmallOverlay data={data} pulseKey={pulseKey} title={title} rankProgress={rankProgress} lpTone={tone} />;
	return <LauchgruenOverlay data={data} pulseKey={pulseKey} displayDurationSeconds={displayDurationSeconds} title={title} rankProgress={rankProgress} lpTone={tone} />;
}
