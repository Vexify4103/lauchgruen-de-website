"use client";

import type { ComponentProps } from "react";
import { ChampSelectClient } from "../ChampSelectClient";

export type DraftViewerPerspective = "neutral" | "blue" | "red";

/** Read-only champ select for stream and team viewer links; same board as the captains see. */
export function DraftSpectatorClient(props: Omit<ComponentProps<typeof ChampSelectClient>, "editableSide" | "isOwner" | "spectator"> & { perspective: DraftViewerPerspective }) {
	// Blue and red viewer links show the same public board; the perspective only names the route.
	const { perspective, ...board } = props;
	void perspective;
	return <ChampSelectClient {...board} editableSide={null} isOwner={false} spectator />;
}
