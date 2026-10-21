import { NextResponse } from "next/server";
import { getAzChallengeSnapshot } from "@/lib/az-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		const preview = new URL(request.url).searchParams.has("test");
		const snapshot = await getAzChallengeSnapshot("tlgfabi", { preview });
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
