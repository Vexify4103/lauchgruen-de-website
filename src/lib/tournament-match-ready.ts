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
}): DiscordOperation | null {
	const channelId = input.team.discordTextChannelId?.trim();
	const roleId = input.team.discordRoleId?.trim();
	if (!channelId || !roleId) return null;
	const matchUrl = `${input.tournamentUrl.replace(/\/$/, "")}/matches/${encodeURIComponent(input.matchId)}`;
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
						"Euer nächstes Match wurde von der Turnierleitung freigegeben. Öffnet jetzt euren persönlichen Roll, prüft Champion und Build und bestätigt, sobald ihr bereit seid.",
					color: 0xb7f36b,
					fields: [
						{ name: "EUER TEAM", value: `**${input.team.name}**`, inline: true },
						{ name: "GEGNER", value: `**${input.opponent.name}**`, inline: true },
						{ name: "RUNDE", value: `${input.round} · ${input.time}`, inline: false },
					],
					footer: { text: "Lauchgruen Ultimate Bravery · Jeder Spieler bedient nur seinen eigenen Roll" },
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

export function buildMatchReadyDiscordOperations(input: {
	teamA: TournamentTeam;
	teamB: TournamentTeam;
	matchId: string;
	round: string;
	time: string;
	dedupeScope: string;
	tournamentUrl?: string;
}): { operations: DiscordOperation[]; missingTeamCount: number } {
	const tournamentUrl = input.tournamentUrl ?? "https://tournament.lauchgruen.de";
	const operations = [
		matchReadyOperation({ ...input, team: input.teamA, opponent: input.teamB, tournamentUrl }),
		matchReadyOperation({ ...input, team: input.teamB, opponent: input.teamA, tournamentUrl }),
	].filter((operation): operation is DiscordOperation => Boolean(operation));
	return { operations, missingTeamCount: 2 - operations.length };
}
