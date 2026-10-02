// How many champions a Fearless format can use up, so admins see before the event whether the pool lasts.
import { playoffDefinitions, type BracketDefinition } from "@/lib/bracket-engine";
import { CHAMPION_POSITIONS } from "@/lib/champion-positions";
import { fearlessLocksPerGame, type FearlessRules } from "@/lib/fearless";
import { mainEventTeamCount, swissEliminationRounds, type StructureConfig } from "@/lib/tournament-structure";

const BANS_PER_GAME = 10;
const PICKS_PER_TEAM = 5;
/** Champions Riot lists without role data (new releases) still count for the pool. */
export const KNOWN_CHAMPION_COUNT = Object.keys(CHAMPION_POSITIONS).length;
const BOTTOM_CHAMPION_COUNT = Object.values(CHAMPION_POSITIONS).filter((roles) => roles.includes("bottom")).length;

/** Longest run of games one team can play through a bracket, counting every game of a series. */
function longestBracketPath(definitions: BracketDefinition[], gamesOf: (definition: BracketDefinition) => number): number {
	const memo = new Map<string, number>();
	const followers = (id: string) =>
		definitions.filter(
			(definition) => definition.resetOf === id || [definition.teamA, definition.teamB].some((slot) => slot.kind !== "seed" && slot.kind !== "table" && slot.matchId === id)
		);
	const walk = (definition: BracketDefinition): number => {
		const known = memo.get(definition.id);
		if (known !== undefined) return known;
		const best = gamesOf(definition) + Math.max(0, ...followers(definition.id).map(walk));
		memo.set(definition.id, best);
		return best;
	};
	const entries = definitions.filter((definition) => [definition.teamA, definition.teamB].some((slot) => slot.kind === "seed"));
	return Math.max(0, ...entries.map(walk));
}

/** Most games a single team can play in the whole event (worst case, every series goes the distance). */
export function maxGamesPerTeam(config: StructureConfig): number {
	const dayOneBestOf = config.bestOf.dayOne;
	const mainTeams = mainEventTeamCount(config);
	const playIn = config.playInTeamCount > 0 ? dayOneBestOf : 0;
	const dayOneMatches = (() => {
		switch (config.dayOneFormat) {
			case "groups":
				return (Math.ceil(mainTeams / Math.max(1, config.groupCount)) - 1) * config.groupRoundRobinLegs;
			case "gsl":
				return 3;
			case "swiss":
				return config.swissRounds;
			case "swiss-elimination":
				return swissEliminationRounds(config.swissWinsToAdvance);
			default:
				return 0;
		}
	})();
	const playoffTeams = config.dayOneFormat === "none" ? mainTeams : config.advanceTeamCount;
	const gamesOf = (definition: BracketDefinition) => (definition.stage === "finals" ? config.bestOf.finals : config.bestOf.playoffs);
	const playoffs =
		config.format === "round-robin"
			? (playoffTeams - 1) * config.bestOf.playoffs + config.bestOf.finals
			: longestBracketPath(playoffDefinitions(config.format, playoffTeams, { thirdPlaceMatch: config.thirdPlaceMatch, grandFinalReset: config.grandFinalReset }), gamesOf);
	return playIn + dayOneMatches * dayOneBestOf + playoffs;
}

export type FearlessCapacity = {
	/** Most games one team can play while its locks keep growing. */
	games: number;
	/** Champions a team can have locked before its last game. */
	lockedBeforeLastGame: number;
	/** Champions left for that team's last pick after locks, ten bans and the other picks of that game. */
	leftForLastPick: number;
	/** Bot-lane champions left before the last game. */
	bottomLeft: number;
	bottomPool: number;
	championPool: number;
	enough: boolean;
};

export function fearlessCapacity(config: StructureConfig, rules: FearlessRules, championPool = KNOWN_CHAMPION_COUNT): FearlessCapacity {
	// Series scope resets every match, so only the longest series matters.
	const games = rules.scope === "series" ? Math.max(config.bestOf.dayOne, config.bestOf.playoffs, config.bestOf.finals) : maxGamesPerTeam(config);
	const perGame = fearlessLocksPerGame(rules);
	const lockedBeforeLastGame = Math.min(championPool, Math.max(0, games - 1) * perGame);
	// Worst case in the last game: all bans and the other nine picks hit champions that were still free.
	const leftForLastPick = championPool - lockedBeforeLastGame - BANS_PER_GAME - (PICKS_PER_TEAM * 2 - 1);
	const bottomPerGame = perGame === 10 ? 2 : 1;
	const bottomLeft = Math.max(0, BOTTOM_CHAMPION_COUNT - Math.max(0, games - 1) * bottomPerGame);
	return {
		games,
		lockedBeforeLastGame,
		leftForLastPick: Math.max(0, leftForLastPick),
		bottomLeft,
		bottomPool: BOTTOM_CHAMPION_COUNT,
		championPool,
		enough: leftForLastPick >= 1,
	};
}
