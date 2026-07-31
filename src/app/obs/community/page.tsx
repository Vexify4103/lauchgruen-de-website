import { CommunityPerformanceOverlay } from "@/components/obs/CommunityPerformanceOverlay";
import { parseCommunityOverlayConfig } from "@/lib/community-overlay-config";

export const dynamic = "force-dynamic";

export default async function CommunityObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const raw = await searchParams;
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(raw)) {
		if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
		else if (value !== undefined) params.set(key, value);
	}
	const preview = params.has("preview") || params.has("test") || params.getAll("").some((value) => value.toLowerCase() === "test");
	return (
		<CommunityPerformanceOverlay
			config={parseCommunityOverlayConfig(params)}
			preview={preview}
			freeformEditorOptions={{
				grid: params.get("editorgrid") !== "0",
				snap: params.get("editorsnap") !== "0",
				safeArea: params.get("editorsafe") !== "0",
			}}
		/>
	);
}
