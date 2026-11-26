import type { WinOverlayOptions } from "./WinOverlay";

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/** Reads ?scale= ?align= ?hideList= ?pot= ?limit= ?bg= with safe bounds. */
export function parseWinOverlayOptions(params: Params): WinOverlayOptions {
	const scale = Number(first(params.scale));
	const limit = Number(first(params.limit));
	const bg = first(params.bg) === undefined ? NaN : Number(first(params.bg));
	return {
		scale: Number.isFinite(scale) && scale >= 0.5 && scale <= 3 ? scale : 1,
		align: first(params.align) === "right" ? "right" : "left",
		hideList: first(params.hideList) === "1",
		showPot: first(params.pot) === "1",
		limit: Number.isInteger(limit) && limit >= 1 && limit <= 20 ? limit : 8,
		bg: Number.isFinite(bg) && bg >= 0 && bg <= 100 ? bg : 55,
	};
}
