import { NextResponse } from "next/server";
import { recordTournamentCallback, riotTournamentApi } from "@/lib/riot-tournament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_000;

/**
 * Riot posts the result of every tournament-code game here (provider callback URL).
 * Anyone can call this URL, so the body is only stored next to a known code and never applied.
 * Riot retries until it gets a 200, so unknown or broken payloads still answer 200.
 */
export async function POST(request: Request) {
	if (!riotTournamentApi()) return NextResponse.json({ ok: true, ignored: "disabled" });
	const raw = await request.text().catch(() => "");
	if (!raw || raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: true, ignored: "size" });
	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return NextResponse.json({ ok: true, ignored: "json" });
	}
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ ok: true, ignored: "shape" });
	try {
		await recordTournamentCallback(payload as Record<string, unknown>);
		// Same answer for known and unknown codes, so the route cannot be used to test codes.
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("[riot-callback] could not store callback", error);
		// Non-200 makes Riot retry, which is what we want when the database is down.
		return NextResponse.json({ ok: false }, { status: 503 });
	}
}
