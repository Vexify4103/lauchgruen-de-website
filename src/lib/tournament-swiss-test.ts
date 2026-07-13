import type { SwissTeam } from "@/lib/tournament-swiss";

export const SWISS_TEST_ID = "swiss-test";
const FALLBACK_NAMES = ["Team Ahorn", "Team Birke", "Team Eiche", "Team Fichte", "Team Kastanie", "Team Linde", "Team Tanne", "Team Weide"];

export function buildSwissTestTeams(teamCount: number, existingTeams: SwissTeam[]): SwissTeam[] {
	return Array.from({ length: teamCount }, (_, index) => ({
		key: `swiss-test-team-${index + 1}`,
		name: existingTeams[index]?.name ?? FALLBACK_NAMES[index] ?? `Test-Team ${index + 1}`,
	}));
}
