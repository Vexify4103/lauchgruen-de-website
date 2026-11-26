import { parseWinOverlayOptions } from "@/components/obs/winchallenge/options";
import { WinTeamOverlay } from "@/components/obs/winchallenge/WinOverlay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Win Challenge Overlay", robots: { index: false, follow: false } };

export default async function WinChallengeBarOverlay({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	return <WinTeamOverlay slug={slug} mode="bar" options={parseWinOverlayOptions(query)} />;
}
