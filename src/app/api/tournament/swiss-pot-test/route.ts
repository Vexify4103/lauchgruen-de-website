import { NextResponse } from "next/server";
import { z } from "zod";
import { getSwissPotSession, isLocalSwissSandbox, SwissPotConflict, updateSwissPotSession } from "@/lib/swiss-pot-sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
	revision: z.number().int().nonnegative(),
	action: z.discriminatedUnion("type", [
		z.object({ type: z.literal("draw") }),
		z.object({ type: z.literal("reset") }),
		z.object({ type: z.literal("result"), pairingId: z.string().max(100), winnerTeamKey: z.string().max(100) }),
		z.object({ type: z.literal("approve-rematch"), record: z.enum(["2-1", "1-2"]) }),
	]),
});
function denied(request: Request) {
	if (!isLocalSwissSandbox(request.headers.get("host"))) return NextResponse.json({ message: "Nicht gefunden." }, { status: 404 });
	const origin = request.headers.get("origin");
	if (origin) {
		try {
			if (new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		} catch {
			return NextResponse.json({ message: "Ungültiger Ursprung." }, { status: 403 });
		}
	}
	return null;
}
export async function GET(request: Request) {
	const rejection = denied(request);
	if (rejection) return rejection;
	try {
		return NextResponse.json(await getSwissPotSession(), { headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ message: "Lokale MongoDB nicht erreichbar. Docker-Container lauchgruen-local-mongo (Port 27027) starten." }, { status: 503 });
	}
}
export async function POST(request: Request) {
	const rejection = denied(request);
	if (rejection) return rejection;
	const body = schema.safeParse(await request.json().catch(() => null));
	if (!body.success) return NextResponse.json({ message: "Ungültige Testaktion." }, { status: 400 });
	try {
		return NextResponse.json(await updateSwissPotSession(body.data.action, body.data.revision), { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		if (error instanceof SwissPotConflict) return NextResponse.json({ message: error.message, ...(await getSwissPotSession()) }, { status: 409 });
		if (error instanceof Error && (error.name.startsWith("Mongo") || error.name === "TypeError"))
			return NextResponse.json({ message: "Lokale Testdatenbank nicht erreichbar. Bitte den Mongo-Container prüfen." }, { status: 503 });
		return NextResponse.json({ message: error instanceof Error ? error.message : "Die Testaktion konnte nicht ausgeführt werden." }, { status: 409 });
	}
}
