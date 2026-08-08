import { StreamerPerformanceOverlay } from "@/components/obs/StreamerPerformanceOverlay";
import { getStreamerObsSnapshot, type LauchgruenObsResponse } from "@/lib/streamer-obs";

export const dynamic = "force-dynamic";

export default async function NachtdienstObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const preview = firstParam(params[""])?.toLowerCase() === "test" || params.test !== undefined;
	let initial: LauchgruenObsResponse;
	try {
		initial = await getStreamerObsSnapshot("nachtdienst", { preview });
	} catch (error) {
		initial = fallback(error);
	}

	return <StreamerPerformanceOverlay initial={initial} endpoint={`/api/obs/nachtdienst${preview ? "?test=1" : ""}`} layout="nachtdienst" forceVisible={preview} />;
}

function fallback(error: unknown): LauchgruenObsResponse {
	return {
		online: false,
		leagueLive: false,
		liveQueueId: 420,
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
		riotId: "Nacktdienst#LoL",
		twitchLogin: "nachtdienst",
		updatedAt: new Date().toISOString(),
		message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
	};
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
