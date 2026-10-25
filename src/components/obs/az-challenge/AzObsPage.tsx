import { AZ_CHALLENGES, getAzChallengeSnapshot, type AzChallengeSlug, type AzChallengeSnapshot } from "@/lib/az-challenge";
import { AzChallengeOverlay, type AzOverlayMode, type AzReactionDemo } from "./AzChallengeOverlay";
import { AZ_THEMES, type AzTheme } from "./az-overlay-css";

const DEMOS: AzReactionDemo[] = ["win", "loss", "letter", "milestone", "streak", "all"];
const MODES: AzOverlayMode[] = ["auto", "full", "compact"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Server part of an A-Z challenge OBS browser source (one per streamer route).
 * Recommended source size: 720 x 300 on a 1920 x 1080 canvas.
 *
 * Query:
 * - `?scale=0.8` shrinks it
 * - `?theme=gold|ice` overrides the streamer's color theme
 * - `?mode=full|compact` pins one layout (default `auto`: compact while a Solo/Duo game runs)
 * - `?test` keeps it visible while offline
 * - `?test&ingame` / `?test&ingame=Viktor` simulates a live game on the target / an off-pick
 * - `?test&demo=win|loss|letter|milestone|streak|all` plays reaction animations
 */
export async function AzObsPage({ slug, searchParams }: { slug: AzChallengeSlug; searchParams: SearchParams }) {
	const params = await searchParams;
	const preview = firstParam(params[""])?.toLowerCase() === "test" || params.test !== undefined;
	const scaleParam = Number(firstParam(params.scale));
	const scale = Number.isFinite(scaleParam) && scaleParam >= 0.4 && scaleParam <= 2 ? scaleParam : 1;
	const modeParam = firstParam(params.mode) as AzOverlayMode | undefined;
	const mode = modeParam && MODES.includes(modeParam) ? modeParam : "auto";
	const themeParam = firstParam(params.theme) as AzTheme | undefined;
	const theme = themeParam && AZ_THEMES.includes(themeParam) ? themeParam : AZ_CHALLENGES[slug].theme;
	const demoLive = preview && params.ingame !== undefined ? (firstParam(params.ingame) ?? "") : undefined;
	// `?celebrate` stays as an alias for the win demo.
	const demoParam = (firstParam(params.demo) ?? (params.celebrate !== undefined ? "win" : undefined)) as AzReactionDemo | undefined;
	const demo = preview && demoParam && DEMOS.includes(demoParam) ? demoParam : undefined;

	let initial: AzChallengeSnapshot | null = null;
	try {
		initial = await getAzChallengeSnapshot(slug, { preview, demoLive });
	} catch (error) {
		console.error(`[${slug}-obs] initial snapshot failed:`, error);
	}

	const endpointParams = new URLSearchParams();
	if (preview) endpointParams.set("test", "1");
	if (demoLive !== undefined) endpointParams.set("ingame", demoLive);
	const query = endpointParams.toString();

	return (
		<AzChallengeOverlay
			initial={initial}
			endpoint={`/api/obs/${slug}${query ? `?${query}` : ""}`}
			forceVisible={preview}
			scale={scale}
			mode={mode}
			theme={theme}
			demo={demo}
		/>
	);
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
