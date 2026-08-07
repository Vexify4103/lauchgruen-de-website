import { LauchgruenPerformanceOverlay } from "@/components/obs/LauchgruenPerformanceOverlay";
import { getStreamerObsSnapshot, type LauchgruenObsResponse } from "@/lib/streamer-obs";

export const dynamic = "force-dynamic";

export default async function HappyGigantoObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const unnamed = firstParam(params[""])?.toLowerCase();
	const preview = unnamed === "test" || params.test !== undefined;
	let initial: LauchgruenObsResponse;
	try {
		initial = await getStreamerObsSnapshot("happygiganto", { preview });
	} catch (error) {
		initial = {
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
			riotId: "cutie patootie#happy",
			twitchLogin: "happygiganto",
			updatedAt: new Date().toISOString(),
			message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
		};
	}

	return <LauchgruenPerformanceOverlay initial={initial} endpoint={`/api/obs/happygiganto${preview ? "?test=1" : ""}`} layout="rankPortrait" forceVisible={preview} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
