import { AzObsPage } from "@/components/obs/az-challenge/AzObsPage";

export const dynamic = "force-dynamic";

/** Spaceffs's A-Z challenge overlay (ice theme). Query options: see AzObsPage. */
export default function SpaceffsObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <AzObsPage slug="spaceffs" searchParams={searchParams} />;
}
