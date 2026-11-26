import type { Metadata } from "next";
import { buildPublicChallenge } from "@/lib/winchallenge/view";
import { LeaderboardClient } from "./LeaderboardClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Win Challenge | Lauchgruen" } };

export default async function WinChallengePage() {
	const initial = await buildPublicChallenge().catch(() => null);
	return <LeaderboardClient initial={initial} />;
}
