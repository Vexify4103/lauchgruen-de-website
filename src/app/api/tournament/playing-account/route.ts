import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { claimAdminVersion, getAdminVersion } from "@/lib/admin-version";
import { getAccountByRiotId, getSummonerByPuuid, RiotApiError } from "@/lib/riot";
import { findApplication, findBlacklistMatch, TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { playingAccountApprovalSchema, playingAccountResetSchema, playingAccountResource, type ApprovedPlayingAccount } from "@/lib/tournament-playing-account";
import { playingAccountConflict, readPlayingAccounts, removePlayingAccount, writePlayingAccount } from "@/lib/tournament-playing-account-store";
import { writeAuditLog } from "@/lib/tournament-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function admin() {
	const session = await auth();
	const id = session?.user?.discordId;
	return id && TOURNAMENT_OWNER_DISCORD_IDS.has(id) ? { id, label: session?.user?.discordHandle ?? id } : null;
}

export async function GET(request: Request) {
	if (!(await admin())) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const id = new URL(request.url).searchParams.get("applicationId");
	const application = id ? await findApplication(id) : null;
	if (!application) return NextResponse.json({ message: "Bewerbung nicht gefunden." }, { status: 404 });
	const settings = await getTournamentSettings();
	const tournamentId = settings.activeTournament.id;
	const [accounts, version] = await Promise.all([readPlayingAccounts(tournamentId), getAdminVersion(playingAccountResource(tournamentId, application.discordId))]);
	return NextResponse.json({ tournamentId, tournamentName: settings.activeTournament.name, approval: accounts.get(application.discordId) ?? null, version });
}

export async function POST(request: Request) {
	return mutate(request, false);
}

export async function DELETE(request: Request) {
	return mutate(request, true);
}

async function mutate(request: Request, reset: boolean) {
	const actor = await admin();
	if (!actor) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const body: unknown = await request.json().catch(() => null);
	const parsed = (reset ? playingAccountResetSchema : playingAccountApprovalSchema).safeParse(body);
	if (!parsed.success) return NextResponse.json({ message: "Bitte Riot-ID, Begründung und Freigabe bestätigen." }, { status: 400 });
	const settings = await getTournamentSettings();
	if (parsed.data.tournamentId !== settings.activeTournament.id) {
		return NextResponse.json({ message: "Das aktive Turnier hat sich geändert. Bitte die Seite neu laden." }, { status: 409 });
	}
	const application = await findApplication(parsed.data.applicationId);
	if (!application) return NextResponse.json({ message: "Bewerbung nicht gefunden." }, { status: 404 });
	const { tournamentId } = parsed.data;
	let approval: ApprovedPlayingAccount | null = null;
	if (!reset) {
		const input = playingAccountApprovalSchema.parse(body);
		try {
			const [name, tag] = input.riotId.split("#");
			const account = await getAccountByRiotId(name, tag);
			// Resolve a League account on the configured tournament platform, not just a Riot login.
			await getSummonerByPuuid(account.puuid);
			if (account.puuid === application.riotPuuid) {
				return NextResponse.json({ message: "Dies ist bereits der verknüpfte Account. Bitte die Freigabe zurücksetzen." }, { status: 400 });
			}
			const riotId = `${account.gameName}#${account.tagLine}`;
			if (await findBlacklistMatch({ discordId: application.discordId, riotId })) {
				return NextResponse.json({ message: "Für diesen Account besteht eine Turniersperre." }, { status: 403 });
			}
			if (await playingAccountConflict(account.puuid, application.discordId, tournamentId)) {
				return NextResponse.json({ message: "Dieser Account ist bereits einem anderen Teilnehmer zugeordnet." }, { status: 409 });
			}
			approval = {
				tournamentId,
				discordId: application.discordId,
				riotId,
				puuid: account.puuid,
				scoutRiotId: application.scoutRiotId || application.riotId,
				reason: input.reason,
				approvedBy: actor.id,
				approvedAt: new Date().toISOString(),
			};
		} catch (error) {
			if (error instanceof RiotApiError)
				return NextResponse.json(
					{ message: error.status === 404 ? "Riot-Account nicht gefunden." : "Riot ist gerade nicht erreichbar. Die Freigabe wurde nicht geändert." },
					{ status: error.status === 404 ? 404 : 502 }
				);
			return NextResponse.json({ message: "Der Account konnte nicht geprüft werden. Bitte erneut versuchen." }, { status: 503 });
		}
	}
	const claim = await claimAdminVersion({
		resource: playingAccountResource(tournamentId, application.discordId),
		expectedVersion: parsed.data.expectedVersion,
		updatedBy: actor.label,
	});
	if (!claim.ok) return NextResponse.json(claim.conflict, { status: 409 });
	const previous = (await readPlayingAccounts(tournamentId)).get(application.discordId);
	try {
		if (approval) await writePlayingAccount(approval);
		else await removePlayingAccount(tournamentId, application.discordId);
	} catch (error) {
		const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
		return NextResponse.json(
			{
				message: duplicate ? "Dieser Spielaccount wurde inzwischen einem anderen Teilnehmer zugeordnet." : "Freigabe konnte nicht gespeichert werden.",
				version: claim.version,
			},
			{ status: duplicate ? 409 : 503 }
		);
	}
	await writeAuditLog({
		action: approval ? "playing-account.approve" : "playing-account.reset",
		targetType: "application",
		targetId: application.id,
		summary: `${application.displayName}: Turnier-Spielaccount ${approval ? `freigegeben (${approval.riotId})` : "zurückgesetzt"}.`,
		actorDiscordId: actor.id,
		actorLabel: actor.label,
		metadata: {
			tournamentId,
			previousRiotId: previous?.riotId ?? application.riotId,
			riotId: approval?.riotId ?? application.riotId,
			reason: approval?.reason,
			mainAccountUnchanged: true,
			balancingRankUnchanged: true,
		},
	});
	return NextResponse.json({
		approval,
		version: claim.version,
		message: approval ? "Spielaccount für dieses Turnier freigegeben." : "Freigabe entfernt. Der verknüpfte Account wird wieder verwendet.",
	});
}
