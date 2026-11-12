import { getDb } from "@/lib/mongo";
import { activePlayingAccounts, type ApprovedPlayingAccount } from "@/lib/tournament-playing-account";

type ApprovalDoc = ApprovedPlayingAccount & { _id: string };
export const PLAYING_ACCOUNT_COLLECTION = "tournament_playing_accounts";

export async function readPlayingAccounts(tournamentId: string) {
	const db = await getDb();
	const documents = await db.collection<ApprovalDoc>(PLAYING_ACCOUNT_COLLECTION).find({ tournamentId }).toArray();
	return activePlayingAccounts(documents, tournamentId);
}

export async function writePlayingAccount(approval: ApprovedPlayingAccount) {
	const collection = (await getDb()).collection<ApprovalDoc>(PLAYING_ACCOUNT_COLLECTION);
	// Also protects against two admins concurrently approving the same account for different players.
	await collection.createIndex({ tournamentId: 1, puuid: 1 }, { unique: true, name: "unique_playing_account_per_tournament" });
	const _id = JSON.stringify([approval.tournamentId, approval.discordId]);
	await collection.replaceOne({ _id }, approval, { upsert: true });
}

export async function removePlayingAccount(tournamentId: string, discordId: string) {
	await (await getDb()).collection<ApprovalDoc>(PLAYING_ACCOUNT_COLLECTION).deleteOne({ tournamentId, discordId });
}

/** Check main identities as well as private/published rosters, including manual players. */
export async function playingAccountConflict(puuid: string, discordId: string, tournamentId: string) {
	const db = await getDb();
	const [linked, applicant, approvals, bot, draft] = await Promise.all([
		db.collection("verified_riot_accounts").findOne({ puuid, discordId: { $ne: discordId } }),
		db.collection("tournament_applications").findOne({ riotPuuid: puuid, discordId: { $ne: discordId } }),
		readPlayingAccounts(tournamentId),
		db.collection<{ _id: string; teams?: Record<string, { players?: Array<{ puuid?: string; discordId?: string }> }> }>("bot_state").findOne({ _id: "default" }),
		db.collection<{ _id: string; teams?: Record<string, { players?: Array<{ puuid?: string; discordId?: string }> }> }>("tournament_roster_drafts").findOne({ _id: "default" }),
	]);
	return Boolean(
		linked ||
		applicant ||
		[...approvals.values()].some((a) => a.puuid === puuid && a.discordId !== discordId) ||
		[bot, draft].some((doc) => Object.values(doc?.teams ?? {}).some((team) => team.players?.some((p) => p.puuid === puuid && p.discordId !== discordId)))
	);
}
