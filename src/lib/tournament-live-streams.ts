import { getStreams } from "@/lib/twitch";
import { listTwitchLinksForDiscordIds } from "@/lib/tournament-storage";
import type { TournamentTeam } from "@/lib/tournament-data";

export type TournamentLiveStream = {
	discordId: string;
	teamName: string;
	playerName: string;
	riotId: string;
	twitchLogin: string;
	twitchDisplayName: string;
	profileImageUrl: string;
	title: string;
	gameName: string;
	viewerCount: number;
	thumbnailUrl: string;
	preview: boolean;
};

export async function getTournamentLiveStreams(teams: TournamentTeam[], liveTeamNames: string[], options?: { previewOffline?: boolean }): Promise<TournamentLiveStream[]> {
	const relevantTeams = teams.filter((team) => liveTeamNames.includes(team.name));
	const players = relevantTeams.flatMap((team) => team.players.filter((player) => Boolean(player.discordId)).map((player) => ({ team, player })));
	const discordIds = players.map(({ player }) => player.discordId).filter((discordId): discordId is string => Boolean(discordId));
	const links = (await listTwitchLinksForDiscordIds(discordIds)).filter((link) => link.showWhenLive);
	const linkByDiscordId = new Map(links.map((link) => [link.discordId, link]));
	const liveByLogin = await getStreams(links.map((link) => link.login));

	return players.flatMap(({ team, player }) => {
		if (!player.discordId) return [];
		const link = linkByDiscordId.get(player.discordId);
		if (!link) return [];
		const stream = liveByLogin.get(link.login.toLowerCase());
		if (!stream && !options?.previewOffline) return [];

		return [
			{
				discordId: player.discordId,
				teamName: team.name,
				playerName: player.name,
				riotId: player.riotId,
				twitchLogin: link.login,
				twitchDisplayName: link.displayName,
				profileImageUrl: link.profileImageUrl,
				title: stream?.title ?? "Admin-Vorschau für einen laufenden Turnierstream",
				gameName: stream?.gameName ?? "League of Legends",
				viewerCount: stream?.viewerCount ?? 0,
				thumbnailUrl: stream?.thumbnailUrl ?? "",
				preview: !stream,
			},
		];
	});
}

export type TwitchPresence = {
	login: string;
	displayName: string;
	profileImageUrl: string;
	/** Set while the channel is live, at any time (not only during matches). */
	live: { viewerCount: number; title: string; gameName: string } | null;
};

/**
 * Twitch channel and live state for every rostered player who opted in on /me
 * ("Auf der Turnierseite zeigen"). Keyed by Discord ID. Twitch errors give an empty map.
 */
export async function getTeamTwitchPresence(teams: TournamentTeam[]): Promise<Map<string, TwitchPresence>> {
	const discordIds = teams.flatMap((team) => team.players.map((player) => player.discordId)).filter((id): id is string => Boolean(id));
	try {
		const links = (await listTwitchLinksForDiscordIds(discordIds)).filter((link) => link.showWhenLive);
		const liveByLogin = await getStreams(links.map((link) => link.login)).catch(() => new Map());
		return new Map(
			links.map((link) => {
				const stream = liveByLogin.get(link.login.toLowerCase());
				return [
					link.discordId,
					{
						login: link.login,
						displayName: link.displayName,
						profileImageUrl: link.profileImageUrl,
						live: stream ? { viewerCount: stream.viewerCount, title: stream.title, gameName: stream.gameName } : null,
					},
				];
			})
		);
	} catch (error) {
		console.error("[teams] Twitch-Status konnte nicht geladen werden.", error);
		return new Map();
	}
}
