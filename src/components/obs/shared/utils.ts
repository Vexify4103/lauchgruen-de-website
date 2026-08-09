import type { LauchgruenObsResponse } from "@/lib/streamer-obs";

export function tierName(tier?: string) {
	if (!tier) return "Unranked";
	const labels: Record<string, string> = {
		IRON: "Iron",
		BRONZE: "Bronze",
		SILVER: "Silber",
		GOLD: "Gold",
		PLATINUM: "Platin",
		EMERALD: "Emerald",
		DIAMOND: "Diamond",
		MASTER: "Master",
		GRANDMASTER: "Grandmaster",
		CHALLENGER: "Challenger",
	};
	return labels[tier.toUpperCase()] ?? tier;
}

export function rankLabel(rank: LauchgruenObsResponse["rank"]) {
	return rank ? `${tierName(rank.tier)} ${rank.rank}` : "Unranked";
}

export function queueLabel(queue: string | number | null | undefined) {
	if (queue === "RANKED_FLEX_SR" || queue === 440) return "Ranked Flex";
	if (queue === "RANKED_SOLO_5x5" || queue === 420) return "Solo/Duo";
	return "Ranked";
}

export function formatDuration(seconds: number) {
	const safe = Math.max(0, seconds);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const secs = safe % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function lpTone(lpDelta: number) {
	return lpDelta > 0 ? "text-lime-200" : lpDelta < 0 ? "text-rose-300" : "text-emerald-100/70";
}

export function overlaySignature(data: LauchgruenObsResponse) {
	return JSON.stringify({
		online: data.online,
		leagueLive: data.leagueLive,
		rank: data.rank?.score ?? null,
		queue: data.rank?.queueType ?? null,
		lp: data.lpDelta,
		w: data.sessionWins,
		l: data.sessionLosses,
		games: data.lastGames.map((game) => `${game.matchId}:${game.win}`).join("|"),
	});
}
