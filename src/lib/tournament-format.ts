import type { TournamentSettings } from "@/lib/tournament-settings";

export function playoffFormatLabel(format: TournamentSettings["ultimateBravery"]["format"], short = false): string | null {
	switch (format) {
		case "double-elimination":
			return short ? "Double" : "Double Elimination";
		case "double-elimination-light":
			return short ? "Double Light" : "Double Elimination Light";
		case "single-elimination":
			return short ? "Single" : "Single Elimination";
		case "undecided":
			return null;
	}
}
