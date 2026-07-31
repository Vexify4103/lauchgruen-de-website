import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { formatRank, getLeagueEntriesByPuuid, getSummonerByPuuid, profileIconUrl, RiotApiError } from "@/lib/riot";
import { deleteRiotChallenge, getRiotChallenge, upsertVerifiedAccount, type VerifiedRiotAccount } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	}

	const challenge = await getRiotChallenge(discordId);
	if (!challenge) {
		return NextResponse.json({ message: "Keine aktive Verifizierung. Bitte starte eine neue." }, { status: 404 });
	}
	if (challenge.expiresAt.getTime() < Date.now()) {
		await deleteRiotChallenge(discordId);
		return NextResponse.json({ message: "Verifizierung abgelaufen. Bitte starte eine neue." }, { status: 410 });
	}

	try {
		const summoner = await getSummonerByPuuid(challenge.puuid, { forceFresh: true });
		if (summoner.profileIconId !== challenge.expectedIconId) {
			const unchanged = summoner.profileIconId === challenge.initialIconId;
			const detail = unchanged
				? "Riot liefert weiterhin dein vorheriges Profilicon. Unten siehst du exakt den Stand, den die Riot-API gerade meldet."
				: `Riot liefert Icon-ID ${summoner.profileIconId}, erwartet wird ${challenge.expectedIconId}. Unten siehst du beide Icons zum Vergleich.`;
			return NextResponse.json(
				{
					message: detail,
					currentIconId: summoner.profileIconId,
					currentIconUrl: profileIconUrl(summoner.profileIconId),
					expectedIconId: challenge.expectedIconId,
					expectedIconUrl: profileIconUrl(challenge.expectedIconId),
					checkedAt: new Date().toISOString(),
					revisionDate: summoner.revisionDate,
				},
				{ status: 409 }
			);
		}

		const leagueEntries = await getLeagueEntriesByPuuid(challenge.puuid);
		const verified: VerifiedRiotAccount = {
			discordId,
			riotId: challenge.riotId,
			gameName: challenge.gameName,
			tagLine: challenge.tagLine,
			puuid: challenge.puuid,
			currentRankAuto: formatRank(leagueEntries),
			summonerLevel: summoner.summonerLevel,
			verifiedAt: new Date().toISOString(),
		};
		await upsertVerifiedAccount(verified);
		await deleteRiotChallenge(discordId);
		return NextResponse.json({ verified });
	} catch (error) {
		if (error instanceof RiotApiError) {
			return NextResponse.json({ message: error.message }, { status: error.status === 404 ? 404 : 502 });
		}
		throw error;
	}
}
