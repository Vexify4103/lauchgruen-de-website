import { NextResponse } from "next/server";
import { getCommunityObsSnapshot } from "@/lib/community-obs";
import { parseCommunityOverlayConfig } from "@/lib/community-overlay-config";
import { RiotApiError } from "@/lib/riot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const config = parseCommunityOverlayConfig(url.searchParams);
	if (!config.accountId && !config.ingame.includes("#")) {
		return NextResponse.json({ message: "Die Riot-ID muss im Format Name#Tag angegeben werden." }, { status: 400 });
	}

	try {
		const snapshot = await getCommunityObsSnapshot({
			streamer: config.streamer,
			ingame: config.ingame,
			accountId: config.accountId,
			region: config.region,
			historyCount: config.showHistory || config.rotateLastGame ? config.historyRows * 5 : 0,
			sessionOnly: config.sessionOnly,
			includeLiveGame: config.showLiveGame || config.showStreamerParticipants,
			includeStreamerParticipants: config.showStreamerParticipants,
			detectLiveQueue: config.showQueue,
			includeProfileIcon: config.style === "portrait",
			previewLiveGame: (config.showLiveGame || config.showStreamerParticipants) && url.searchParams.has("preview"),
			includeApexGoals: config.showGoal && ["auto", "GRANDMASTER", "CHALLENGER", "RANK_1"].includes(config.goalTier),
			preview: url.searchParams.has("preview"),
		});
		return NextResponse.json(snapshot, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" } });
	} catch (error) {
		const status = error instanceof RiotApiError && error.status >= 400 && error.status <= 599 ? error.status : 500;
		return NextResponse.json(
			{
				message: error instanceof Error ? error.message : "Overlay-Daten konnten nicht geladen werden.",
				updatedAt: new Date().toISOString(),
			},
			{ status }
		);
	}
}
