import { TlgFabiAzOverlay, type AzOverlayMode, type AzReactionDemo } from "@/components/obs/tlgfabi/TlgFabiAzOverlay";
import { getAzChallengeSnapshot, type AzChallengeSnapshot } from "@/lib/az-challenge";

export const dynamic = "force-dynamic";

const DEMOS: AzReactionDemo[] = ["win", "loss", "letter", "milestone", "streak", "all"];
const MODES: AzOverlayMode[] = ["auto", "full", "compact"];

/**
 * OBS browser source for TLG Fabi's A-Z challenge.
 * Recommended source size: 720 x 300 on a 1920 x 1080 canvas.
 *
 * Query:
 * - `?scale=0.8` shrinks it
 * - `?mode=full|compact` pins one layout (default `auto`: compact while a Solo/Duo game runs)
 * - `?test` keeps it visible while offline
 * - `?test&ingame` / `?test&ingame=Viktor` simulates a live game on the target / an off-pick
 * - `?test&demo=win|loss|letter|milestone|streak|all` plays reaction animations
 */
export default async function TlgFabiObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const preview = firstParam(params[""])?.toLowerCase() === "test" || params.test !== undefined;
	const scaleParam = Number(firstParam(params.scale));
	const scale = Number.isFinite(scaleParam) && scaleParam >= 0.4 && scaleParam <= 2 ? scaleParam : 1;
	const modeParam = firstParam(params.mode) as AzOverlayMode | undefined;
	const mode = modeParam && MODES.includes(modeParam) ? modeParam : "auto";
	const demoLive = preview && params.ingame !== undefined ? (firstParam(params.ingame) ?? "") : undefined;
	// `?celebrate` stays as an alias for the win demo.
	const demoParam = (firstParam(params.demo) ?? (params.celebrate !== undefined ? "win" : undefined)) as AzReactionDemo | undefined;
	const demo = preview && demoParam && DEMOS.includes(demoParam) ? demoParam : undefined;

	let initial: AzChallengeSnapshot | null = null;
	try {
		initial = await getAzChallengeSnapshot("tlgfabi", { preview, demoLive });
	} catch (error) {
		console.error("[tlgfabi-obs] initial snapshot failed:", error);
	}

	const endpointParams = new URLSearchParams();
	if (preview) endpointParams.set("test", "1");
	if (demoLive !== undefined) endpointParams.set("ingame", demoLive);
	const query = endpointParams.toString();

	return <TlgFabiAzOverlay initial={initial} endpoint={`/api/obs/tlgfabi${query ? `?${query}` : ""}`} forceVisible={preview} scale={scale} mode={mode} demo={demo} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
