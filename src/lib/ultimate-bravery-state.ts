import type { UltimateBraveryRoll } from "@/lib/ultimate-bravery";
import type { UltimateBraveryMatchPlayer } from "@/lib/ultimate-bravery-match";

export type UltimateBraveryDraftStatus = {
	allLocked: boolean;
	claimedCount: number;
	lockedCount: number;
	rerollRequestCount: number;
	totalPlayers: number;
};

export function getUltimateBraveryDraftStatus(players: UltimateBraveryMatchPlayer[], rolls: UltimateBraveryRoll[]): UltimateBraveryDraftStatus {
	const claimedPlayers = players.filter((player) => player.discordId);
	const lockedCount = claimedPlayers.filter((player) => rolls.some((roll) => roll.discordId === player.discordId && roll.status === "locked" && !roll.rerollRequestedAt)).length;
	const rerollRequestCount = rolls.filter((roll) => roll.rerollRequestedAt).length;

	return {
		allLocked: players.length > 0 && claimedPlayers.length === players.length && lockedCount === players.length && rerollRequestCount === 0,
		claimedCount: claimedPlayers.length,
		lockedCount,
		rerollRequestCount,
		totalPlayers: players.length,
	};
}
