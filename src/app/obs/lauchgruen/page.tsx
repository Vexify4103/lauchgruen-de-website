import { LauchgruenPerformanceOverlay } from "@/components/obs/LauchgruenPerformanceOverlay";
import { getStreamerObsSnapshot, type LauchgruenObsResponse } from "@/lib/lauchgruen-obs";

export const dynamic = "force-dynamic";

export default async function LauchgruenObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const unnamedParams = paramValues(params[""]).map((value) => value.toLowerCase());
	const variantParam = firstParam(params.variant) ?? firstParam(params.size);
	const variant = variantParam?.toLowerCase() === "small" || unnamedParams.includes("small") ? "small" : "full";
	const preview = unnamedParams.includes("test") || params.test !== undefined;
	let initial: LauchgruenObsResponse;
	try {
		initial = await getStreamerObsSnapshot("lauchgruen", { preview });
	} catch (error) {
		initial = {
			online: false,
			leagueLive: false,
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
			riotId: "lauchgruentv#euw",
			twitchLogin: "lauchgruen",
			updatedAt: new Date().toISOString(),
			message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
		};
	}

	return <LauchgruenPerformanceOverlay initial={initial} variant={variant} endpoint={`/api/obs/lauchgruen${preview ? "?test=1" : ""}`} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function paramValues(value: string | string[] | undefined): string[] {
	if (Array.isArray(value)) return value;
	return value === undefined ? [] : [value];
}
