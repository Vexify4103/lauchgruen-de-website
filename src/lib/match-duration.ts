export function formatGameDuration(totalSeconds: number | undefined): string {
	if (totalSeconds === undefined || !Number.isFinite(totalSeconds)) return "";
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.floor(totalSeconds % 60);
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function parseGameDuration(value: string): number | null {
	const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim());
	if (!match) return null;
	const totalSeconds = Number(match[1]) * 60 + Number(match[2]);
	return totalSeconds > 0 ? totalSeconds : null;
}
