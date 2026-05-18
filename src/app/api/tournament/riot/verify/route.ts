import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  formatRank,
  getLeagueEntriesByPuuid,
  getSummonerByPuuid,
  RiotApiError,
} from "@/lib/riot";
import {
  deleteRiotChallenge,
  getRiotChallenge,
  upsertVerifiedAccount,
  type VerifiedRiotAccount,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json(
      { message: "Bitte zuerst mit Discord anmelden." },
      { status: 401 },
    );
  }

  const challenge = await getRiotChallenge(discordId);
  if (!challenge) {
    return NextResponse.json(
      { message: "Keine aktive Verifizierung. Bitte starte eine neue." },
      { status: 404 },
    );
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    await deleteRiotChallenge(discordId);
    return NextResponse.json(
      { message: "Verifizierung abgelaufen. Bitte starte eine neue." },
      { status: 410 },
    );
  }

  try {
    const summoner = await getSummonerByPuuid(challenge.puuid);
    if (summoner.profileIconId !== challenge.expectedIconId) {
      const unchanged = summoner.profileIconId === challenge.initialIconId;
      const detail = unchanged
        ? "Riot zeigt noch dein altes Icon. Icon-Änderungen synchronisieren mit Riots öffentlicher API erst nach einem Logout + Login im League-Client. Mach das, dann erneut klicken."
        : `Riot zeigt Icon-ID ${summoner.profileIconId}, erwartet wurde ${challenge.expectedIconId}. Stelle sicher, dass du das richtige Icon gewählt hast, dann im League-Client ab- und wieder anmelden, um die Synchronisation zu erzwingen.`;
      return NextResponse.json(
        {
          message: detail,
          currentIconId: summoner.profileIconId,
          expectedIconId: challenge.expectedIconId,
        },
        { status: 409 },
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
      verifiedAt: new Date().toISOString(),
    };
    await upsertVerifiedAccount(verified);
    await deleteRiotChallenge(discordId);

    return NextResponse.json({ verified });
  } catch (error) {
    if (error instanceof RiotApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status === 404 ? 404 : 502 },
      );
    }
    throw error;
  }
}
