import { LauchgruenPerformanceOverlay } from "@/components/obs/LauchgruenPerformanceOverlay";
import { getStreamerObsSnapshot, type LauchgruenObsResponse } from "@/lib/lauchgruen-obs";

export const dynamic = "force-dynamic";

export default async function N4cht4r4ObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const preview = firstParam(params[""])?.toLowerCase() === "test" || params.test !== undefined;
	let initial: LauchgruenObsResponse;
	try {
		initial = await getStreamerObsSnapshot("n4cht4r4", { preview });
	} catch (error) {
		initial = fallbackSnapshot(error);
	}

	return <LauchgruenPerformanceOverlay initial={initial} endpoint={`/api/obs/n4cht4r4${preview ? "?test=1" : ""}`} layout="n4cht4r4" forceVisible={preview} />;
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
		riotId: "N4cht4r4#cute",
		twitchLogin: "n4cht4r4",
		updatedAt: new Date().toISOString(),
		message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
	};
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
