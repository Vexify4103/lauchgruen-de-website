import { getMatchControlContext } from "@/lib/match-control";
import { listUltimateBraveryTestSlots, ULTIMATE_BRAVERY_TEST_MATCH_ID } from "@/lib/ultimate-bravery-test";

export type UltimateBraveryMatchPlayer = {
	discordId?: string;
	name: string;
	riotId: string;
	role: string;
	teamName: string;
};

export async function resolveUltimateBraveryMatchPlayers(matchId: string): Promise<UltimateBraveryMatchPlayer[] | null> {
	if (matchId === ULTIMATE_BRAVERY_TEST_MATCH_ID) {
		return (await listUltimateBraveryTestSlots()).map((slot) => ({
			discordId: slot.discordId,
			name: slot.displayName ?? "Freier Testplatz",
			riotId: slot.displayName ? `${slot.displayName}#TEST` : "Noch nicht belegt",
			role: slot.role,
			teamName: slot.teamName,
		}));
	}

	const context = await getMatchControlContext();
	const match = context.matches.find((entry) => entry.id === matchId);
	if (!match) return null;
	return context.teams
		.filter((team) => team.name === match.teamAName || team.name === match.teamBName)
		.flatMap((team) =>
			team.players
				.filter((player) => player.role !== "Sub")
				.slice(0, 5)
				.map((player) => ({
					discordId: player.discordId,
					name: player.name,
					riotId: player.riotId,
					role: player.role,
					teamName: team.name,
				}))
		);
}
