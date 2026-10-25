"use client";

import { useEffect, useRef, useState } from "react";
import type { AzChallengeSnapshot } from "@/lib/az-challenge";
import { AzCompactBar } from "./AzCompactBar";
import { AlphabetBar } from "./AzPieces";
import { ReactionScene } from "./AzReactionScenes";
import { AlphabetScene, Header, HuntScene, LastScene, NumbersScene, RoadScene } from "./AzScenes";
import { LEAVE_MS, OVERLAY_CSS } from "./az-overlay-css";
import { REACTION_MS, demoAzReactions, detectAzReactions, type AzReaction, type AzReactionDemo } from "./az-reactions";

export type { AzReactionDemo } from "./az-reactions";
export type AzOverlayMode = "auto" | "full" | "compact";

const POLL_INTERVAL_MS = 10_000;
const LAYOUT_SWITCH_MS = 420;
const MAX_QUEUED_REACTIONS = 6;

type SceneId = "hunt" | "last" | "road" | "alphabet" | "numbers";

const SCENE_MS: Record<SceneId, number> = {
	hunt: 16_000,
	last: 11_000,
	road: 11_000,
	alphabet: 11_000,
	numbers: 12_000,
};

const ROTATION: SceneId[] = ["hunt", "last", "road", "alphabet", "numbers"];

function rotation(hasLast: boolean): SceneId[] {
	return hasLast ? ROTATION : ROTATION.filter((scene) => scene !== "last");
}

export function TlgFabiAzOverlay({
	initial,
	endpoint,
	forceVisible = false,
	scale = 1,
	mode = "auto",
	demo,
}: {
	initial: AzChallengeSnapshot | null;
	endpoint: string;
	forceVisible?: boolean;
	scale?: number;
	/** auto: compact while a counted game runs, full otherwise. */
	mode?: AzOverlayMode;
	/** Test helper: play sample reactions on load. */
	demo?: AzReactionDemo;
}) {
	const [data, setData] = useState(initial);
	const [scene, setScene] = useState<SceneId>("hunt");
	// Key of the scene that is playing its exit animation. Tied to a key (not a
	// boolean) so a new scene or reaction can never inherit a stuck "leaving" state.
	const [leavingKey, setLeavingKey] = useState<string | null>(null);
	const [reactions, setReactions] = useState<AzReaction[]>(() => (demo && initial ? demoAzReactions(initial, demo) : []));
	const previous = useRef(initial);

	// Poll and turn differences between two snapshots into reactions.
	useEffect(() => {
		let cancelled = false;
		const refresh = async () => {
			try {
				const response = await fetch(endpoint, { cache: "no-store" });
				if (!response.ok) return;
				const next = (await response.json()) as AzChallengeSnapshot;
				if (cancelled || typeof next.completedCount !== "number" || !next.insights) return;
				const before = previous.current;
				previous.current = next;
				if (before) {
					const found = detectAzReactions(before, next);
					if (found.length) setReactions((queue) => [...queue, ...found].slice(-MAX_QUEUED_REACTIONS));
				}
				setData(next);
			} catch {
				// OBS keeps polling; transient errors must not flash the source.
			}
		};
		const first = window.setTimeout(refresh, initial ? POLL_INTERVAL_MS : 0);
		const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(first);
			window.clearInterval(timer);
		};
	}, [endpoint, initial]);

	const hasLast = Boolean(data?.lastCompleted);
	const hasLastRef = useRef(hasLast);
	useEffect(() => {
		hasLastRef.current = hasLast;
	}, [hasLast]);
	const activeReaction = reactions[0] ?? null;
	const activeKey = activeReaction ? activeReaction.id : scene;
	const activeMs = activeReaction ? REACTION_MS[activeReaction.kind] : SCENE_MS[scene];
	const reactionActive = activeReaction !== null;
	const leaving = leavingKey === activeKey;

	// Scene rotation; reactions interrupt it and hand back to the hunt scene.
	// Only a new active key restarts the timers, so data polls never cut a
	// running exit animation short.
	useEffect(() => {
		let leaveTimer: number | undefined;
		const showTimer = window.setTimeout(() => {
			setLeavingKey(activeKey);
			leaveTimer = window.setTimeout(() => {
				if (reactionActive) {
					setReactions((queue) => queue.slice(1));
					setScene("hunt");
				} else {
					setScene((current) => {
						const order = rotation(hasLastRef.current);
						return order[(order.indexOf(current) + 1) % order.length] ?? "hunt";
					});
				}
				setLeavingKey(null);
			}, LEAVE_MS);
		}, activeMs);
		return () => {
			window.clearTimeout(showTimer);
			if (leaveTimer) window.clearTimeout(leaveTimer);
		};
	}, [activeKey, activeMs, reactionActive]);

	// Layout: compact while a counted game runs, full between games and for reactions.
	const wantedLayout: "full" | "compact" =
		mode === "compact" ? "compact" : mode === "full" ? "full" : data?.live && !reactionActive ? "compact" : "full";
	const [shownLayout, setShownLayout] = useState(wantedLayout);
	const [layoutLeaving, setLayoutLeaving] = useState(false);
	useEffect(() => {
		if (wantedLayout === shownLayout) return;
		const start = window.setTimeout(() => setLayoutLeaving(true), 0);
		const swap = window.setTimeout(() => {
			setShownLayout(wantedLayout);
			setLayoutLeaving(false);
		}, LAYOUT_SWITCH_MS);
		return () => {
			window.clearTimeout(start);
			window.clearTimeout(swap);
		};
	}, [wantedLayout, shownLayout]);

	if (!data) return null;
	if (!forceVisible && !data.leagueLive) return null;

	const currentLetter = data.current?.champion.letter ?? "Z";
	const dots = rotation(hasLast);
	const compact = shownLayout === "compact";

	return (
		<div className={`azf-root ${compact ? "is-compact" : ""}`} style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}>
			{compact ? (
				<div key="compact" className={layoutLeaving ? "azf-layout-leave" : undefined}>
					<AzCompactBar data={data} />
				</div>
			) : (
				<div key="full" className={`${layoutLeaving ? "azf-layout-leave" : ""} ${activeReaction?.kind === "loss" ? "azf-shake" : ""}`}>
					<section className="azf-panel">
						<div aria-hidden className="azf-watermark" key={`wm-${currentLetter}`}>
							{currentLetter}
						</div>
						<div aria-hidden className="azf-sweep" key={`sweep-${activeKey}`} />

						<Header data={data} dots={dots} activeDot={activeReaction ? null : scene} dotKey={activeKey} dotDurationMs={activeMs} />

						<div className="azf-stage">
							<div key={activeKey} className={`azf-scene ${leaving ? "azf-leave" : ""}`}>
								{activeReaction ? (
									<ReactionScene reaction={activeReaction} />
								) : scene === "last" && data.lastCompleted ? (
									<LastScene done={data.lastCompleted} />
								) : scene === "road" ? (
									<RoadScene data={data} />
								) : scene === "alphabet" ? (
									<AlphabetScene data={data} />
								) : scene === "numbers" ? (
									<NumbersScene data={data} />
								) : (
									<HuntScene data={data} />
								)}
							</div>
						</div>

						<AlphabetBar data={data} />
					</section>
				</div>
			)}
			<style>{OVERLAY_CSS}</style>
		</div>
	);
}
