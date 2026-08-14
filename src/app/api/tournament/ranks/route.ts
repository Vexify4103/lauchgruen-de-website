import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { formatRank, getAccountByPuuid, getLeagueEntriesByPuuid, getSummonerByPuuid } from "@/lib/riot";
import { writeAuditLog } from "@/lib/tournament-audit";
import {
	TOURNAMENT_OWNER_DISCORD_IDS,
	findApplication,
	findApplicationByDiscordId,
	listApplications,
	listVerifiedAccounts,
	updateVerifiedAccountSnapshot,
	upsertApplication,
	type TournamentApplication,
	type VerifiedRiotAccount,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFRESH_DELAY_MS = 2600;

const refreshSchema = z.object({
	id: z.string().trim().min(1).optional(),
	puuid: z.string().trim().min(1).optional(),
	audit: z.boolean().optional(),
});

const bulkAuditSchema = z.object({
	scope: z.enum(["applications", "verified"]),
	okCount: z.number().int().nonnegative(),
	failCount: z.number().int().nonnegative(),
	changedCount: z.number().int().nonnegative(),
	unchangedCount: z.number().int().nonnegative(),
});

type RefreshResult = {
	id: string;
	displayName: string;
	riotId: string;
	previousRiotId?: string;
	rank: string | null;
	summonerLevel?: number;
	changes?: Array<{ field: string; before: string; after: string }>;
	ok: boolean;
	message?: string;
};

type StoredRosterPlayer = { puuid?: string; riotId?: string };
type StoredRosterTeam = {
	players?: StoredRosterPlayer[];
	meta?: { captain?: { puuid?: string; riotId?: string } };
};

async function updateStoredRosterRiotId(puuid: string, riotId: string) {
	const db = await getDb();
	const botCollection = db.collection<{ _id: string; teams?: Record<string, StoredRosterTeam> }>("bot_state");
	const draftCollection = db.collection<{ _id: string; teams?: Record<string, { players?: StoredRosterPlayer[]; captain?: { puuid?: string; riotId?: string } }> }>(
		"tournament_roster_drafts"
	);
	const [botState, rosterDraft] = await Promise.all([botCollection.findOne({ _id: "default" }), draftCollection.findOne({ _id: "default" })]);
	const botUpdates: Record<string, string> = {};
	const draftUpdates: Record<string, string> = {};

	for (const [teamKey, team] of Object.entries(botState?.teams ?? {})) {
		for (const [index, player] of (team.players ?? []).entries()) {
			if (player.puuid === puuid && player.riotId !== riotId) botUpdates[`teams.${teamKey}.players.${index}.riotId`] = riotId;
		}
		if (team.meta?.captain?.puuid === puuid && team.meta.captain.riotId !== riotId) {
			botUpdates[`teams.${teamKey}.meta.captain.riotId`] = riotId;
		}
	}

	for (const [teamKey, team] of Object.entries(rosterDraft?.teams ?? {})) {
		for (const [index, player] of (team.players ?? []).entries()) {
			if (player.puuid === puuid && player.riotId !== riotId) draftUpdates[`teams.${teamKey}.players.${index}.riotId`] = riotId;
		}
		if (team.captain?.puuid === puuid && team.captain.riotId !== riotId) {
			draftUpdates[`teams.${teamKey}.captain.riotId`] = riotId;
		}
	}

	await Promise.all([
		Object.keys(botUpdates).length > 0 ? botCollection.updateOne({ _id: "default" }, { $set: botUpdates }) : Promise.resolve(),
		Object.keys(draftUpdates).length > 0 ? draftCollection.updateOne({ _id: "default" }, { $set: draftUpdates }) : Promise.resolve(),
	]);
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshApplicationProfile(app: TournamentApplication): Promise<RefreshResult> {
	try {
		const [account, entries, summoner] = await Promise.all([getAccountByPuuid(app.riotPuuid), getLeagueEntriesByPuuid(app.riotPuuid), getSummonerByPuuid(app.riotPuuid)]);
		const currentRankAuto = formatRank(entries);
		const riotId = `${account.gameName}#${account.tagLine}`;
		const changes: Array<{ field: string; before: string; after: string }> = [];
		if (app.riotId !== riotId) changes.push({ field: "Riot-ID", before: app.riotId, after: riotId });
		if (app.currentRankAuto !== currentRankAuto) {
			changes.push({ field: "Rang", before: app.currentRankAuto ?? "Unranked", after: currentRankAuto ?? "Unranked" });
		}
		if (app.summonerLevel !== summoner.summonerLevel) {
			changes.push({ field: "Level", before: String(app.summonerLevel ?? "Unbekannt"), after: String(summoner.summonerLevel) });
		}
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
			app.riotId !== riotId ? updateStoredRosterRiotId(app.riotPuuid, riotId) : Promise.resolve(),
		]);
		return {
			id: app.id,
			displayName: app.displayName,
			riotId,
			previousRiotId: app.riotId !== riotId ? app.riotId : undefined,
			rank: currentRankAuto,
			summonerLevel: summoner.summonerLevel,
			changes,
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

async function refreshVerifiedProfile(accounts: VerifiedRiotAccount[]): Promise<RefreshResult> {
	const stored = accounts[0];
	try {
		const [account, entries, summoner] = await Promise.all([
			getAccountByPuuid(stored.puuid),
			getLeagueEntriesByPuuid(stored.puuid),
			getSummonerByPuuid(stored.puuid),
		]);
		const currentRankAuto = formatRank(entries);
		const riotId = `${account.gameName}#${account.tagLine}`;
		const changes: Array<{ field: string; before: string; after: string }> = [];
		if (stored.riotId !== riotId) changes.push({ field: "Riot-ID", before: stored.riotId, after: riotId });
		if (stored.currentRankAuto !== currentRankAuto) {
			changes.push({ field: "Rang", before: stored.currentRankAuto ?? "Unranked", after: currentRankAuto ?? "Unranked" });
		}
		if (stored.summonerLevel !== summoner.summonerLevel) {
			changes.push({ field: "Level", before: String(stored.summonerLevel ?? "Unbekannt"), after: String(summoner.summonerLevel) });
		}

		await Promise.all(
			accounts.map(async (verified) => {
				const application = await findApplicationByDiscordId(verified.discordId);
				await Promise.all([
					updateVerifiedAccountSnapshot(verified.discordId, {
						riotId,
						gameName: account.gameName,
						tagLine: account.tagLine,
						currentRankAuto,
						summonerLevel: summoner.summonerLevel,
					}),
					application?.riotPuuid === stored.puuid
						? upsertApplication({
								...application,
								riotId,
								currentRankAuto,
								summonerLevel: summoner.summonerLevel,
								updatedAt: new Date().toISOString(),
							})
						: Promise.resolve(),
				]);
			})
		);
		if (accounts.some((verified) => verified.riotId !== riotId)) {
			await updateStoredRosterRiotId(stored.puuid, riotId);
		}

		return {
			id: stored.puuid,
			displayName: riotId,
			riotId,
			previousRiotId: stored.riotId !== riotId ? stored.riotId : undefined,
			rank: currentRankAuto,
			summonerLevel: summoner.summonerLevel,
			changes,
			ok: true,
		};
	} catch (error) {
		return {
			id: stored.puuid,
			displayName: stored.riotId,
			riotId: stored.riotId,
			rank: stored.currentRankAuto,
			ok: false,
			message: error instanceof Error ? error.message : "Riot-Profil konnte nicht aktualisiert werden.",
		};
	}
}

async function requireOwner() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	return discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId) ? { session, discordId } : null;
}

export async function GET() {
	const owner = await requireOwner();
	if (!owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });

	const accounts = await listVerifiedAccounts();
	const byPuuid = new Map<string, VerifiedRiotAccount[]>();
	for (const account of accounts) byPuuid.set(account.puuid, [...(byPuuid.get(account.puuid) ?? []), account]);

	return NextResponse.json({
		accounts: [...byPuuid.entries()].map(([puuid, linked]) => ({
			id: puuid,
			label: linked.length > 1 ? `${linked[0].riotId} · ${linked.length} Verknüpfungen` : linked[0].riotId,
		})),
	});
}

export async function POST(request: Request) {
	const owner = await requireOwner();
	if (!owner) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}
	const { session, discordId } = owner;

	const body = await request.json().catch(() => ({}));
	const parsed = refreshSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Daten für die Profilaktualisierung." }, { status: 400 });
	}

	const results: RefreshResult[] = [];
	if (parsed.data.puuid) {
		const verified = (await listVerifiedAccounts()).filter((account) => account.puuid === parsed.data.puuid);
		if (verified.length === 0) {
			return NextResponse.json({ message: "Keine verifizierte Riot-Verknüpfung gefunden.", results: [] }, { status: 404 });
		}
		results.push(await refreshVerifiedProfile(verified));
	} else {
		const applications = parsed.data.id ? [await findApplication(parsed.data.id)].filter((app): app is TournamentApplication => Boolean(app)) : await listApplications();
		if (applications.length === 0) {
			return NextResponse.json({ message: "Keine Bewerbung gefunden.", results: [] }, { status: 404 });
		}
		for (let index = 0; index < applications.length; index += 1) {
			results.push(await refreshApplicationProfile(applications[index]));
			if (index < applications.length - 1) await sleep(REFRESH_DELAY_MS);
		}
	}

	const okCount = results.filter((result) => result.ok).length;
	const failCount = results.length - okCount;
	const renamedCount = results.filter((result) => result.previousRiotId).length;
	if (parsed.data.audit !== false) {
		try {
			await writeAuditLog({
				action: parsed.data.id || parsed.data.puuid ? "riot_profile.refresh_one" : "riot_profile.refresh_all",
				targetType: parsed.data.puuid ? "verified_riot_accounts" : "applications",
				targetId: parsed.data.puuid ?? parsed.data.id ?? "all",
				summary: `Riot-Profile aktualisiert: ${okCount} ok, ${failCount} Fehler, ${renamedCount} Name-Updates. Rang und Summoner-Level wurden synchronisiert.`,
				actorDiscordId: discordId,
				actorLabel: session.user.discordHandle ?? discordId,
				metadata: { okCount, failCount, renamedCount, count: results.length },
			});
		} catch (error) {
			console.error("[riot-profile-refresh] Audit-Log konnte nicht geschrieben werden.", error);
		}
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

export async function PUT(request: Request) {
	const owner = await requireOwner();
	if (!owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = bulkAuditSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Zusammenfassung." }, { status: 400 });

	const { scope, okCount, failCount, changedCount, unchangedCount } = parsed.data;
	await writeAuditLog({
		action: "riot_profile.refresh_all",
		targetType: scope === "verified" ? "verified_riot_accounts" : "applications",
		targetId: "all",
		summary: `${okCount + failCount} Riot-Profile geprüft: ${changedCount} geändert, ${unchangedCount} unverändert, ${failCount} Fehler.`,
		actorDiscordId: owner.discordId,
		actorLabel: owner.session.user.discordHandle ?? owner.discordId,
		metadata: { scope, okCount, failCount, changedCount, unchangedCount },
	});
	return NextResponse.json({ saved: true });
}
