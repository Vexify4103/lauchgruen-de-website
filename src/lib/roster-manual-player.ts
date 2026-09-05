export type ManualRosterIdentityInput = {
	discordId?: string;
	discordUsername?: string;
	displayName?: string;
	riotId: string;
	verificationStatus?: "verified" | "manual";
};

export function resolveManualRosterIdentity(player: ManualRosterIdentityInput) {
	const discordUsername = player.discordUsername?.replace(/^@+/, "").trim();
	const displayName = player.displayName?.trim() || discordUsername || player.riotId.split("#")[0] || "Manueller Spieler";

	return {
		discordUsername,
		displayName,
		discordHandle: discordUsername ? `@${discordUsername}` : displayName,
		verified: player.verificationStatus === "verified",
	};
}
