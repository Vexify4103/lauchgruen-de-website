import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  parseRiotId,
  pickChallengeIcon,
  profileIconUrl,
  RiotApiError,
} from "@/lib/riot";
import { startRiotChallenge } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  riotId: z.string().trim().min(3).max(80),
});

export async function POST(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json(
      { message: "Bitte zuerst mit Discord anmelden." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Riot-ID ist erforderlich." }, { status: 400 });
  }

  let gameName: string;
  let tagLine: string;
  try {
    ({ gameName, tagLine } = parseRiotId(parsed.data.riotId));
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }

  try {
    const account = await getAccountByRiotId(gameName, tagLine);
    const summoner = await getSummonerByPuuid(account.puuid);
    const expectedIconId = pickChallengeIcon(summoner.profileIconId);

    const challenge = await startRiotChallenge({
      discordId,
      riotId: `${account.gameName}#${account.tagLine}`,
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      initialIconId: summoner.profileIconId,
      expectedIconId,
    });

    return NextResponse.json({
      riotId: challenge.riotId,
      expectedIconId,
      expectedIconUrl: profileIconUrl(expectedIconId),
      currentIconId: summoner.profileIconId,
      expiresAt: challenge.expiresAt.toISOString(),
    });
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
