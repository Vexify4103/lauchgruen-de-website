import { StreamerPerformanceOverlay } from "@/components/obs/StreamerPerformanceOverlay";
import { getStreamerObsSnapshot, type LauchgruenObsResponse } from "@/lib/streamer-obs";

export const dynamic = "force-dynamic";

export default async function XzairenObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const style = firstParam(params.style)?.toLowerCase();
	// Default: ninja style with English text. ?style=ninja-ko keeps the Korean labels, ?style=akali the first draft.
	const layout = style === "ninja-ko" ? "xzairen-ninja" : style === "akali" ? "xzairen" : "xzairen-ninja-en";
	const preview = firstParam(params[""])?.toLowerCase() === "test" || params.test !== undefined;
	let initial: LauchgruenObsResponse;
	try {
		initial = await getStreamerObsSnapshot("xzairen", { preview });
	} catch (error) {
		initial = fallbackSnapshot(error);
	}

	return <StreamerPerformanceOverlay initial={initial} endpoint={`/api/obs/xzairen${preview ? "?test=1" : ""}`} layout={layout} forceVisible={preview} />;
}

function fallbackSnapshot(error: unknown): LauchgruenObsResponse {
	return {
		online: false,
		leagueLive: false,
		liveQueueId: null,
		streamTitle: null,
		streamStartedAt: null,
		streamDurationSeconds: 0,
		viewerCount: 0,
		rank: null,
		baselineRank: null,
		lpDelta: 0,
		sessionWins: 0,
		sessionLosses: 0,
		winRate: 0,
		lastGames: [],
		profileIconUrl: null,
		riotId: "Zairen#LeBla",
		twitchLogin: "xzairen",
		updatedAt: new Date().toISOString(),
		message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
	};
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
