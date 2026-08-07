import { NextResponse } from "next/server";
import { getStreamerObsSnapshot } from "@/lib/streamer-obs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		const preview = new URL(request.url).searchParams.has("test");
		const snapshot = await getStreamerObsSnapshot("hippokrate", { preview });
		return NextResponse.json(snapshot, {
			headers: { "Cache-Control": "public, max-age=15, s-maxage=15" },
		});
	} catch (error) {
		console.error("[hippokrate-obs] snapshot failed:", error);
		return NextResponse.json(
			{
				online: false,
				leagueLive: false,
				message: error instanceof Error ? error.message : "OBS-Daten konnten nicht geladen werden.",
				updatedAt: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
}
