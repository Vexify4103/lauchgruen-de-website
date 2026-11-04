/**
 * Reads a streamer's own A-Z tracking sheet (Google Sheets, shared as
 * "anyone with the link can view") so they decide exceptions themselves:
 *
 * - Match Log tab: a match whose "Counts" cell starts with "No" never counts
 *   ("No (remake)", "No (not challenge)", ...).
 * - Stats tab: a cell "Pause" with a checked box (TRUE/Ja/Yes/x) right next to
 *   it pauses the challenge. Games that end while paused do not count.
 */

const SHEET_CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

export type AzSheetInfo = {
	excludedMatchIds: string[];
	/** null when the Stats tab has no "Pause" cell. */
	paused: boolean | null;
	fetchedAt: string;
};

const g = globalThis as unknown as {
	__azSheets?: Map<string, { expiresAt: number; data: AzSheetInfo }>;
	__azSheetRequests?: Map<string, Promise<AzSheetInfo>>;
};

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += char;
		}
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

const norm = (value: string) => value.trim().toLowerCase();

/** Match ids whose "Counts" cell starts with "No". */
export function parseMatchLogExclusions(csv: string): string[] {
	const [header, ...rows] = parseCsv(csv);
	if (!header) return [];
	const idColumn = header.findIndex((cell) => norm(cell) === "match id");
	const countsColumn = header.findIndex((cell) => norm(cell) === "counts");
	if (idColumn < 0 || countsColumn < 0) return [];
	return rows
		.filter((row) => norm(row[countsColumn] ?? "").startsWith("no"))
		.map((row) => (row[idColumn] ?? "").trim())
		.filter((id) => /^[A-Z0-9]+_\d+$/.test(id));
}

const TRUE_VALUES = new Set(["true", "ja", "yes", "x", "1", "✓", "✔", "an", "on"]);
const PAUSE_LABELS = new Set(["pause", "pausiert", "challenge pausiert", "challenge pause"]);

/** Value of the first non-empty cell right of a "Pause" label, or null without one. */
export function parsePauseFlag(csv: string): boolean | null {
	for (const row of parseCsv(csv)) {
		const labelIndex = row.findIndex((cell) => PAUSE_LABELS.has(norm(cell)));
		if (labelIndex < 0) continue;
		const value = row.slice(labelIndex + 1).find((cell) => cell.trim() !== "");
		return value ? TRUE_VALUES.has(norm(value)) : false;
	}
	return null;
}

async function fetchTab(sheetId: string, tab: string): Promise<string> {
	const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
	const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	const type = response.headers.get("content-type") ?? "";
	// A private sheet answers with a Google login page (HTML), not CSV.
	if (!response.ok || type.includes("text/html")) {
		throw new Error(`Sheet-Tab "${tab}" nicht lesbar (${response.status}). Ist das Sheet für "Jeder mit dem Link" freigegeben?`);
	}
	return response.text();
}

export async function getAzSheetInfo(sheetId: string): Promise<AzSheetInfo> {
	g.__azSheets ??= new Map();
	g.__azSheetRequests ??= new Map();
	const cached = g.__azSheets.get(sheetId);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	const pending = g.__azSheetRequests.get(sheetId);
	if (pending) return pending;

	const request = Promise.all([fetchTab(sheetId, "Match Log"), fetchTab(sheetId, "Stats")])
		.then(([matchLog, stats]) => {
			const data: AzSheetInfo = {
				excludedMatchIds: parseMatchLogExclusions(matchLog),
				paused: parsePauseFlag(stats),
				fetchedAt: new Date().toISOString(),
			};
			g.__azSheets?.set(sheetId, { data, expiresAt: Date.now() + SHEET_CACHE_MS });
			return data;
		})
		.finally(() => g.__azSheetRequests?.delete(sheetId));
	g.__azSheetRequests.set(sheetId, request);
	return request;
}
