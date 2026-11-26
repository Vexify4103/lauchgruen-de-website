import { parseWinOverlayOptions } from "@/components/obs/winchallenge/options";
import { WinLeaderboardOverlay } from "@/components/obs/winchallenge/WinOverlay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Win Challenge Rangliste", robots: { index: false, follow: false } };

export default async function WinChallengeLeaderboardOverlay({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <WinLeaderboardOverlay options={parseWinOverlayOptions(await searchParams)} />;
}
