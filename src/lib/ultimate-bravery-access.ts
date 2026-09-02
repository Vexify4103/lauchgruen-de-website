export function resolveUltimateBraveryActionTarget(input: { actorDiscordId: string; requestedPlayerDiscordId?: string; adminAction: boolean; isOwner: boolean }): string | null {
	if (input.adminAction) return input.isOwner ? (input.requestedPlayerDiscordId ?? null) : null;
	return input.actorDiscordId;
}
