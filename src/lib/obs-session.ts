export function summarizeObsSession<T extends { win: boolean }>(games: T[], visibleLimit = 5) {
	const wins = games.reduce((count, game) => count + (game.win ? 1 : 0), 0);
	const losses = games.length - wins;

	return {
		wins,
		losses,
		winRate: games.length ? Math.round((wins / games.length) * 100) : 0,
		visibleGames: games.slice(0, visibleLimit),
	};
}
