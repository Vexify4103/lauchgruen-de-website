import { z } from "zod";

export type ApprovedPlayingAccount = {
	tournamentId: string;
	discordId: string;
	riotId: string;
	puuid: string;
	scoutRiotId: string;
	reason: string;
	approvedBy: string;
	approvedAt: string;
};

export const playingAccountApprovalSchema = z
	.object({
		applicationId: z.string().trim().min(1),
		tournamentId: z.string().trim().min(1),
		expectedVersion: z.number().int().nonnegative(),
		riotId: z
			.string()
			.trim()
			.regex(/^[^#]{3,16}#[^#]{2,5}$/, "Bitte eine Riot-ID im Format Name#Tag eingeben."),
		reason: z.string().trim().min(5).max(500),
		confirmed: z.literal(true),
	})
	.strict();

export const playingAccountResetSchema = playingAccountApprovalSchema
	.pick({
		applicationId: true,
		tournamentId: true,
		expectedVersion: true,
	})
	.strict();

export function playingAccountResource(tournamentId: string, discordId: string) {
	return `playing-account:${tournamentId}:${discordId}`;
}

/** Derive the playing identity; never mutate the linked account or its rank. */
export function withPlayingAccount<T extends { discordId?: string; riotId: string; puuid?: string; scoutRiotId?: string; displayName?: string }>(
	player: T,
	accounts: ReadonlyMap<string, ApprovedPlayingAccount>
): T & { playingAccountApproved?: boolean; displayName?: string } {
	const approved = player.discordId ? accounts.get(player.discordId) : undefined;
	if (!approved) return player;
	return {
		...player,
		displayName: player.displayName || player.riotId.split("#")[0] || player.riotId,
		riotId: approved.riotId,
		puuid: approved.puuid,
		scoutRiotId: player.scoutRiotId || approved.scoutRiotId,
		playingAccountApproved: true,
	};
}

export function activePlayingAccounts(accounts: ApprovedPlayingAccount[], tournamentId: string) {
	return new Map(accounts.filter((account) => account.tournamentId === tournamentId).map((account) => [account.discordId, account]));
}

/** Membership follows the Discord user, not the mutable account used to play. */
export function findParticipantTeam<T extends { players: Array<{ discordId?: string; riotId: string }>; captainRef?: { discordId: string } }>(
	teams: T[],
	discordId: string,
	linkedRiotId?: string
) {
	return teams.find(
		(team) =>
			team.captainRef?.discordId === discordId ||
			team.players.some((player) => player.discordId === discordId || (!player.discordId && linkedRiotId && player.riotId.toLowerCase() === linkedRiotId.toLowerCase()))
	);
}
