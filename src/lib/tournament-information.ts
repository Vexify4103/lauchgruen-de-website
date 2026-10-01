import { z } from "zod";

export const tournamentInformationSchema = z
	.object({
		name: z.string().trim().min(1).max(160),
		description: z.string().trim().max(8000),
		rulesMarkdown: z.string().trim().max(30000),
	})
	.strict();

export type TournamentInformation = z.infer<typeof tournamentInformationSchema>;

/** Content edits never replace the event identity or its lifecycle state. */
export function applyTournamentInformation<T extends { name: string }>(active: T, information: TournamentInformation): T & TournamentInformation {
	return { ...active, ...information };
}
