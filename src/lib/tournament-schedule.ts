const GROUP_START_HOUR = 18;
const PLAYOFF_START_HOUR = 16;

function rollingHour(startHour: number, offset: number) {
	const totalHour = startHour + offset;
	const hour = totalHour % 24;
	const nextDay = totalHour >= 24;
	return `Richtzeit ${hour.toString().padStart(2, "0")}:00${nextDay ? " (+1 Tag)" : ""} · rollierend`;
}

export function groupRollingTime(round: number) {
	return rollingHour(GROUP_START_HOUR, round - 1);
}

export function groupRollingTimeForMatch(matchId: string) {
	const parts = /^[ab]-r(\d+)-(\d+)$/.exec(matchId);
	if (!parts) return "Rollierender Zeitplan";
	return groupRollingTime(Number(parts[1]));
}

export function playoffRollingTime(blockIndex: number) {
	return rollingHour(PLAYOFF_START_HOUR, blockIndex);
}
