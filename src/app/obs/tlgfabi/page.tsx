import { AzObsPage } from "@/components/obs/az-challenge/AzObsPage";

export const dynamic = "force-dynamic";

/** TLG Fabi's A-Z challenge overlay (gold theme). Query options: see AzObsPage. */
export default function TlgFabiObsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <AzObsPage slug="tlgfabi" searchParams={searchParams} />;
}
