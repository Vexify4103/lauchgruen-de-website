import type { AzChallengeSnapshot, AzChampion, AzCompleted } from "@/lib/az-challenge";

/** Short full-panel moments that interrupt the scene rotation after a game. */
export type AzReaction =
	| { id: string; kind: "win"; done: AzCompleted; next: AzChampion | null }
	| { id: string; kind: "loss"; champion: AzChampion; from: number; to: number; recordBroken: boolean; recordTries: number | null }
	| { id: string; kind: "letter"; from: string; to: string | null; count: number; next: AzChampion | null }
	| { id: string; kind: "milestone"; percent: number; completed: number; total: number }
	| { id: string; kind: "streak"; count: number; champions: AzChampion[] };

export type AzReactionKind = AzReaction["kind"];
export type AzReactionDemo = AzReactionKind | "all";

export const REACTION_MS: Record<AzReactionKind, number> = {
	win: 16_000,
	loss: 9_000,
	letter: 10_000,
	milestone: 9_000,
	streak: 8_000,
};

export const MILESTONES = [10, 25, 50, 75, 100];

function letterTotal(snapshot: AzChallengeSnapshot, letter: string) {
	return snapshot.letters.find((entry) => entry.letter === letter)?.total ?? 0;
}

/**
 * Compares two polls and returns the reactions to play, in order.
 * Nothing fires while the match history is still loading, so a cold start
 * does not replay the whole challenge.
 */
export function detectAzReactions(prev: AzChallengeSnapshot, next: AzChallengeSnapshot): AzReaction[] {
	if (prev.syncing || next.syncing) return [];
	const stamp = next.updatedAt;
	const reactions: AzReaction[] = [];

	if (next.completedCount > prev.completedCount) {
		if (next.lastCompleted) reactions.push({ id: `win-${stamp}`, kind: "win", done: next.lastCompleted, next: next.current?.champion ?? null });

		const fromLetter = prev.current?.champion.letter;
		const toLetter = next.current?.champion.letter ?? null;
		if (fromLetter && fromLetter !== toLetter) {
			reactions.push({ id: `letter-${stamp}`, kind: "letter", from: fromLetter, to: toLetter, count: letterTotal(next, fromLetter), next: next.current?.champion ?? null });
		}

		const crossed = MILESTONES.filter((value) => prev.percent < value && next.percent >= value).at(-1);
		if (crossed !== undefined) {
			reactions.push({ id: `milestone-${stamp}`, kind: "milestone", percent: crossed, completed: next.completedCount, total: next.totalChampions });
		}

		const streak = next.insights.firstTryStreak;
		if (streak >= 2 && streak > prev.insights.firstTryStreak) {
			reactions.push({ id: `streak-${stamp}`, kind: "streak", count: streak, champions: next.recentCompleted.slice(0, streak).map((entry) => entry.champion) });
		}
		return reactions;
	}

	if (prev.current && next.current && prev.current.champion.id === next.current.champion.id && next.current.tryNumber > prev.current.tryNumber) {
		reactions.push({
			id: `loss-${stamp}`,
			kind: "loss",
			champion: next.current.champion,
			from: prev.current.tryNumber,
			to: next.current.tryNumber,
			recordBroken: next.insights.record?.state === "broken" && prev.insights.record?.state !== "broken",
			recordTries: next.insights.record?.tries ?? null,
		});
	}
	return reactions;
}

/** Sample reactions for `?test&demo=…`, built from the current data. */
export function demoAzReactions(snapshot: AzChallengeSnapshot, demo: AzReactionDemo): AzReaction[] {
	const current = snapshot.current;
	const letter = current?.champion.letter ?? "A";
	const nextLetter = letter === "Z" ? null : String.fromCharCode(letter.charCodeAt(0) + 1);
	const milestone = MILESTONES.find((value) => value > snapshot.percent) ?? 100;
	const all: AzReaction[] = [];

	if (snapshot.lastCompleted) all.push({ id: "demo-win", kind: "win", done: snapshot.lastCompleted, next: current?.champion ?? null });
	all.push({
		id: "demo-letter",
		kind: "letter",
		from: letter,
		to: nextLetter,
		count: letterTotal(snapshot, letter),
		next: snapshot.upcoming.find((champion) => champion.letter !== letter) ?? null,
	});
	all.push({ id: "demo-milestone", kind: "milestone", percent: milestone, completed: Math.round((milestone / 100) * snapshot.totalChampions), total: snapshot.totalChampions });
	const streakChampions = snapshot.recentCompleted.slice(0, 3).map((entry) => entry.champion);
	if (streakChampions.length) all.push({ id: "demo-streak", kind: "streak", count: streakChampions.length, champions: streakChampions });
	if (current) {
		all.push({
			id: "demo-loss",
			kind: "loss",
			champion: current.champion,
			from: Math.max(1, current.tryNumber - 1),
			to: Math.max(2, current.tryNumber),
			recordBroken: snapshot.insights.record?.state === "broken",
			recordTries: snapshot.insights.record?.tries ?? null,
		});
	}

	return demo === "all" ? all : all.filter((reaction) => reaction.kind === demo);
}
