import { StreamerPerformanceOverlay } from "@/components/obs/StreamerPerformanceOverlay";
import { getStreamerObsSnapshot, type LauchgruenObsResponse } from "@/lib/streamer-obs";

export const dynamic = "force-dynamic";

export default async function AkumaObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const preview = firstParam(params[""])?.toLowerCase() === "test" || params.test !== undefined;
	let initial: LauchgruenObsResponse;
	try {
		initial = await getStreamerObsSnapshot("akuma", { preview });
	} catch (error) {
		initial = fallbackSnapshot(error);
	}

	return <StreamerPerformanceOverlay initial={initial} endpoint={`/api/obs/akuma${preview ? "?test=1" : ""}`} layout="akuma" forceVisible={preview} />;
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
		riotId: "Aoi Akuma#EUW",
		twitchLogin: "akuma_flo",
		updatedAt: new Date().toISOString(),
		message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
	};
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
