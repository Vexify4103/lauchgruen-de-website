import { AzObsPage } from "@/components/obs/az-challenge/AzObsPage";

export const dynamic = "force-dynamic";

/**
 * Lauchgruen's A-Z challenge overlay (lauch theme). His rank overlay stays at
 * /obs/lauchgruen. Query options: see AzObsPage.
 */
export default function LauchgruenAzObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <AzObsPage slug="lauchgruen" searchParams={searchParams} />;
}
