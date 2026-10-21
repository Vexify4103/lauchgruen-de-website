import { TlgFabiAzOverlay } from "@/components/obs/tlgfabi/TlgFabiAzOverlay";
import { getAzChallengeSnapshot, type AzChallengeSnapshot } from "@/lib/az-challenge";

export const dynamic = "force-dynamic";

/**
 * OBS browser source for TLG Fabi's A-Z challenge.
 * Recommended source size: 720 x 300 on a 1920 x 1080 canvas.
 * Query: `?test` keeps it visible while offline, `?scale=0.8` shrinks it,
 * `?test&celebrate` plays the win celebration once.
 */
export default async function TlgFabiObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const params = await searchParams;
	const preview = firstParam(params[""])?.toLowerCase() === "test" || params.test !== undefined;
	const scaleParam = Number(firstParam(params.scale));
	const scale = Number.isFinite(scaleParam) && scaleParam >= 0.4 && scaleParam <= 2 ? scaleParam : 1;

	let initial: AzChallengeSnapshot | null = null;
	try {
		initial = await getAzChallengeSnapshot("tlgfabi", { preview });
	} catch (error) {
		console.error("[tlgfabi-obs] initial snapshot failed:", error);
	}

	return (
		<TlgFabiAzOverlay
			initial={initial}
			endpoint={`/api/obs/tlgfabi${preview ? "?test=1" : ""}`}
			forceVisible={preview}
			scale={scale}
			demoCelebration={preview && params.celebrate !== undefined}
		/>
	);
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
