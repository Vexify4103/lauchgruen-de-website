import { NextResponse } from "next/server";
import { isBroadcastScene, selectBroadcastMatch, resolveBroadcastTeam, type BroadcastSnapshot } from "@/lib/tournament-broadcast";
import { loadTournamentBroadcast, loadBroadcastDraft } from "@/lib/tournament-broadcast-server";
import { demoBroadcastSnapshot } from "@/lib/tournament-broadcast-demo";
import { getSwissPotSession, isLocalSwissSandbox } from "@/lib/swiss-pot-sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
	const url = new URL(request.url);
	const scene = url.searchParams.get("scene") ?? "tournament-board";
	const source = url.searchParams.get("source");
	const teamId = url.searchParams.get("team") ?? "";
	const matchId = url.searchParams.get("match") ?? "";
	if (!isBroadcastScene(scene) || teamId.length > 160 || matchId.length > 160 || (source && source !== "sandbox")) return json({ message: "Ungültige Broadcast-Auswahl." }, 400);
	try {
		let snapshot: BroadcastSnapshot;
		if (source === "sandbox") {
			if (!isLocalSwissSandbox(request.headers.get("host"))) return json({ message: "Nicht gefunden." }, 404);
			const session = await getSwissPotSession();
			snapshot = {
				...demoBroadcastSnapshot(0),
				source: "sandbox",
				tournament: { id: "swiss-sandbox", name: "Swiss-Generalprobe", mode: "test" },
				draw: session.state,
				drawRevision: String(session.revision),
				matches: [],
				draft: null,
				standings: [],
			};
		} else if (url.searchParams.get("demo") === "1") {
			const input = Number(url.searchParams.get("step") ?? 12);
			snapshot = demoBroadcastSnapshot(Number.isFinite(input) ? Math.max(0, Math.min(20, Math.floor(input))) : 12);
		} else snapshot = await loadTournamentBroadcast();
		const team = teamId ? resolveBroadcastTeam(snapshot.teams, teamId) : null;
		if (teamId && !team) return json({ message: "Dieses Team ist nicht veröffentlicht oder nicht mehr verfügbar." }, 404);
		const selected = selectBroadcastMatch(snapshot.matches, team ?? null, matchId);
		if (matchId && !selected) return json({ message: "Dieses Match ist für die Auswahl nicht verfügbar." }, 404);
		const draft =
			snapshot.draftEnabled && (scene === "champ-select" || scene === "tournament-waiting") && selected
				? snapshot.source === "demo"
					? snapshot.draft
					: await loadBroadcastDraft(selected.id)
				: null;
		return json({ ...snapshot, selectedTeam: team ?? null, selectedMatch: selected, draft });
	} catch {
		return json({ message: "Broadcast-Daten sind vorübergehend nicht erreichbar." }, 503);
	}
}
