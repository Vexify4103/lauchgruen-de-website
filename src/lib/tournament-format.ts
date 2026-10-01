import { PLAYOFF_FORMAT_LABELS, type PlayoffFormat } from "@/lib/tournament-structure";

const SHORT_LABELS: Record<PlayoffFormat, string | null> = {
	undecided: null,
	"single-elimination": "Single",
	"double-elimination": "Double",
	"double-elimination-light": "Double Light",
	"page-playoffs": "Page",
	gauntlet: "Gauntlet",
	"round-robin": "Round Robin",
};

export function playoffFormatLabel(format: PlayoffFormat, short = false): string | null {
	if (format === "undecided") return null;
	return short ? SHORT_LABELS[format] : PLAYOFF_FORMAT_LABELS[format];
}
