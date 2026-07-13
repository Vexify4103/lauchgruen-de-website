import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { formatRank, getAccountByPuuid, getLeagueEntriesByPuuid, getSummonerByPuuid } from "@/lib/riot";
import { writeAuditLog } from "@/lib/tournament-audit";
import {
	TOURNAMENT_OWNER_DISCORD_IDS,
	findApplication,
	listApplications,
	updateVerifiedAccountSnapshot,
	upsertApplication,
	type TournamentApplication,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFRESH_DELAY_MS = 2600;

const refreshSchema = z.object({
	id: z.string().trim().min(1).optional(),
});

type RefreshResult = {
	id: string;
	displayName: string;
	riotId: string;
	previousRiotId?: string;
	rank: string | null;
	summonerLevel?: number;
	ok: boolean;
	message?: string;
};

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshApplicationProfile(app: TournamentApplication): Promise<RefreshResult> {
	try {
		const [account, entries, summoner] = await Promise.all([getAccountByPuuid(app.riotPuuid), getLeagueEntriesByPuuid(app.riotPuuid), getSummonerByPuuid(app.riotPuuid)]);
		const currentRankAuto = formatRank(entries);
		const riotId = `${account.gameName}#${account.tagLine}`;
		const next: TournamentApplication = {
			...app,
			riotId,
			currentRankAuto,
			summonerLevel: summoner.summonerLevel,
			updatedAt: new Date().toISOString(),
		};
		await Promise.all([
			upsertApplication(next),
			updateVerifiedAccountSnapshot(app.discordId, {
				riotId,
				gameName: account.gameName,
				tagLine: account.tagLine,
				currentRankAuto,
				summonerLevel: summoner.summonerLevel,
			}),
		]);
		return {
			id: app.id,
			displayName: app.displayName,
			riotId,
			previousRiotId: app.riotId !== riotId ? app.riotId : undefined,
			rank: currentRankAuto,
			summonerLevel: summoner.summonerLevel,
			ok: true,
		};
	} catch (error) {
		return {
			id: app.id,
			displayName: app.displayName,
			riotId: app.riotId,
			rank: app.currentRankAuto,
			ok: false,
			message: error instanceof Error ? error.message : "Riot-Profil konnte nicht aktualisiert werden.",
		};
	}
}

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const body = await request.json().catch(() => ({}));
	const parsed = refreshSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Daten für die Profilaktualisierung." }, { status: 400 });
	}

	const applications = parsed.data.id ? [await findApplication(parsed.data.id)].filter((app): app is TournamentApplication => Boolean(app)) : await listApplications();

	if (applications.length === 0) {
		return NextResponse.json({ message: "Keine Bewerbung gefunden.", results: [] }, { status: 404 });
	}

	const results: RefreshResult[] = [];
	for (let index = 0; index < applications.length; index += 1) {
		results.push(await refreshApplicationProfile(applications[index]));
		if (index < applications.length - 1) {
			await sleep(REFRESH_DELAY_MS);
		}
	}

	const okCount = results.filter((result) => result.ok).length;
	const failCount = results.length - okCount;
	const renamedCount = results.filter((result) => result.previousRiotId).length;
	try {
		await writeAuditLog({
			action: parsed.data.id ? "riot_profile.refresh_one" : "riot_profile.refresh_all",
			targetType: "applications",
			targetId: parsed.data.id ?? "all",
			summary: `Riot-Profile aktualisiert: ${okCount} ok, ${failCount} Fehler, ${renamedCount} Name-Updates. Rang und Summoner-Level wurden synchronisiert.`,
			actorDiscordId: discordId,
			actorLabel: session.user.discordHandle ?? discordId,
			metadata: { okCount, failCount, renamedCount, count: results.length },
		});
	} catch (error) {
		console.error("[riot-profile-refresh] Audit-Log konnte nicht geschrieben werden.", error);
	}

	const rateLimited = results.some((result) => result.message?.includes("Rate-Limit"));
	return NextResponse.json(
		{
			ok: failCount === 0,
			okCount,
			failCount,
			renamedCount,
			delayMs: REFRESH_DELAY_MS,
			results,
		},
		{ status: rateLimited ? 429 : 200 }
	);
}
