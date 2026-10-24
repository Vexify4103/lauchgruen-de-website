import { NextResponse } from "next/server";
import { getAzChallengeSnapshot } from "@/lib/az-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		const params = new URL(request.url).searchParams;
		const preview = params.has("test");
		// `?test&ingame` simulates a live game on the target, `?test&ingame=Viktor` an off-pick.
		const demoLive = preview && params.has("ingame") ? (params.get("ingame") ?? "") : undefined;
		const snapshot = await getAzChallengeSnapshot("tlgfabi", { preview, demoLive });
		return NextResponse.json(snapshot, {
			headers: { "Cache-Control": "public, max-age=15, s-maxage=15" },
		});
	} catch (error) {
		console.error("[tlgfabi-obs] snapshot failed:", error);
		return NextResponse.json(
			{
				message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
				updatedAt: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
}
