import type { DiscordOperation } from "@/lib/discord-job-queue";
import type { TournamentTeam } from "@/lib/tournament-data";

function matchReadyOperation(input: {
	team: TournamentTeam;
	opponent: TournamentTeam;
	matchId: string;
	round: string;
	time: string;
	dedupeScope: string;
	tournamentUrl: string;
	flow: MatchReadyFlow;
}): DiscordOperation | null {
	const channelId = input.team.discordTextChannelId?.trim();
	const roleId = input.team.discordRoleId?.trim();
	if (!channelId || !roleId) return null;
	const base = input.tournamentUrl.replace(/\/$/, "");
	const matchUrl = input.flow === "draft" ? `${base}/champ-select/${encodeURIComponent(input.matchId)}` : `${base}/matches/${encodeURIComponent(input.matchId)}`;
	return {
		kind: "channel-message",
		channelId,
		roleId,
		dedupeKey: `match-ready:${input.dedupeScope}:${input.matchId}:${input.team.id}`,
		label: `${input.team.name}: Champ-Select-Freigabe senden`,
		payload: {
			content: `<@&${roleId}>`,
			embeds: [
				{
					author: { name: "LAUCHGRUEN · MATCH CALL" },
					title: "Euer Champ Select ist bereit",
					description:
						input.flow === "draft"
							? "Euer nächstes Match wurde von der Turnierleitung freigegeben. Captains: öffnet jetzt den Champ Select und klickt Ready. Denkt an die Fearless-Sperren."
							: "Euer nächstes Match wurde von der Turnierleitung freigegeben. Öffnet jetzt euren persönlichen Roll, prüft Champion und Build und bestätigt, sobald ihr bereit seid.",
					color: 0xb7f36b,
					fields: [
						{ name: "EUER TEAM", value: `**${input.team.name}**`, inline: true },
						{ name: "GEGNER", value: `**${input.opponent.name}**`, inline: true },
						{ name: "RUNDE", value: `${input.round} · ${input.time}`, inline: false },
					],
					footer: {
						text:
							input.flow === "draft"
								? "Lauchgruen Fearless · Nur Captains locken im Champ Select"
								: "Lauchgruen Ultimate Bravery · Jeder Spieler bedient nur seinen eigenen Roll",
					},
					timestamp: new Date().toISOString(),
				},
			],
			components: [
				{
					type: 1,
					components: [{ type: 2, style: 5, label: "Champ Select öffnen", url: matchUrl }],
				},
			],
		},
	};
}

/** `rolls`: Ultimate Bravery build rolls per player. `draft`: captain champ select. */
export type MatchReadyFlow = "rolls" | "draft";

export function buildMatchReadyDiscordOperations(input: {
	teamA: TournamentTeam;
	teamB: TournamentTeam;
	matchId: string;
	round: string;
	time: string;
	dedupeScope: string;
	tournamentUrl?: string;
	flow?: MatchReadyFlow;
}): { operations: DiscordOperation[]; missingTeamCount: number } {
	const tournamentUrl = input.tournamentUrl ?? "https://tournament.lauchgruen.de";
	const flow = input.flow ?? "rolls";
	const operations = [
		matchReadyOperation({ ...input, team: input.teamA, opponent: input.teamB, tournamentUrl, flow }),
		matchReadyOperation({ ...input, team: input.teamB, opponent: input.teamA, tournamentUrl, flow }),
	].filter((operation): operation is DiscordOperation => Boolean(operation));
	return { operations, missingTeamCount: 2 - operations.length };
}
