/** GET /api/obs/winchallenge/[slug]: one team for the stream overlay (public, no login). */
import { handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import { buildPublicChallenge } from "@/lib/winchallenge/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	try {
		const view = await buildPublicChallenge();
		if (!view.challenge) return winError(404, "Aktuell gibt es keine Challenge.");
		const team = view.teams.find((entry) => entry.slug === slug);
		if (!team) return winError(404, "Team nicht gefunden.");
		return winJson({ serverNow: view.serverNow, challenge: { name: view.challenge.name, status: view.challenge.status, games: view.challenge.games }, team, teamCount: view.teams.length });
	} catch (error) {
		return handleWinError(error, "Overlay-Daten konnten nicht geladen werden.");
	}
}
