import { NextResponse } from "next/server";
import { getAzChallengeSnapshot, type AzChallengeSlug } from "@/lib/az-challenge";

/** GET handler body shared by the `/api/obs/<slug>` A-Z challenge routes. */
export async function azChallengeResponse(slug: AzChallengeSlug, request: Request) {
	try {
		const params = new URL(request.url).searchParams;
		const preview = params.has("test");
		// `?test&ingame` simulates a live game on the target, `?test&ingame=Viktor` an off-pick.
		const demoLive = preview && params.has("ingame") ? (params.get("ingame") ?? "") : undefined;
		const snapshot = await getAzChallengeSnapshot(slug, { preview, demoLive });
		return NextResponse.json(snapshot, {
			headers: { "Cache-Control": "public, max-age=10, s-maxage=10" },
		});
	} catch (error) {
		console.error(`[${slug}-obs] snapshot failed:`, error);
		return NextResponse.json(
			{
				message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
				updatedAt: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
}
