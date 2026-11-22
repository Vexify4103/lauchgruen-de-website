/**
 * Keeps extremist, hateful and sexual team names out of the tournament.
 *
 * Captains rename their team themselves, and the name goes live on the site, in Discord and on
 * stream. A list never catches everything, so every captain rename is also posted to the orga
 * channel. This filter stops the obvious cases and their usual disguises:
 * case, umlauts, leetspeak ("St0rm"), separators ("S.t.u.r.m"), and stretched letters ("Stuuurm").
 *
 * Two kinds of terms:
 * - `SUBSTRING_TERMS` are distinctive enough to block anywhere in the name, also across words.
 * - `TOKEN_TERMS` are short codes that only count as a whole word ("88" blocks, "1988" does not).
 */

/** Matched anywhere in the name after normalization (letters only). */
const SUBSTRING_TERMS = [
	// National Socialism, neo-Nazi groups and codes
	"stormfront",
	"sturmfront",
	"hitler",
	"nazi",
	"nsdap",
	"siegheil",
	"heilhitler",
	"endsieg",
	"wolfsschanze",
	"drittesreich",
	"viertesreich",
	"thirdreich",
	"fourthreich",
	"reichsadler",
	"herrenrasse",
	"rassenkrieg",
	"rahowa",
	"whitepower",
	"whitepride",
	"whitelivesmatter",
	"bloodandhonour",
	"bloodandhonor",
	"blutundehre",
	"combat18",
	"kukluxklan",
	"holocaust",
	"auschwitz",
	"gaskammer",
	"vergasen",
	"judensau",
	"meinfuehrer",
	"meinfuhrer",
	"atomwaffen",
	"identitaere",
	// Slurs
	"nigger",
	"nigga",
	"neger",
	"kanake",
	"zigeuner",
	"schwuchtel",
	"faggot",
	"tranny",
	"spast",
	"retard",
	"missgeburt",
	// Insults and sexual terms
	"hurensohn",
	"fotze",
	"wichser",
	"nutte",
	"schlampe",
	"whore",
	"kinderficker",
	"paedo",
	"pedophil",
	"porno",
	"pornhub",
	"vergewaltig",
];

/** Matched only as a whole word, because they are short or appear inside normal words. */
const TOKEN_TERMS = [
	"88",
	"1488",
	"hh",
	"ss",
	"kkk",
	"zog",
	"wpww",
	"c18",
	"nsu",
	"aryan",
	"juden",
	"rape",
	"rapist",
	"cunt",
	"slut",
	"fag",
	"sex",
	"porn",
];

/** Symbols that are blocked wherever they appear: swastikas and SS/Odal runes. */
const BLOCKED_SYMBOLS = ["卐", "卍", "ᛋᛋ", "ϟϟ", "ᛟ", "⚡⚡"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "@": "a", "!": "i", "|": "i", "€": "e" };

function foldUmlauts(value: string): string {
	return value.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

function stripAccents(value: string): string {
	return value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Letters only, with leetspeak mapped back: "St0rm.Front" → "stormfront". */
export function compactName(value: string): string {
	const mapped = [...stripAccents(foldUmlauts(value))].map((char) => LEET[char] ?? char).join("");
	return mapped.replace(/[^a-z]/g, "");
}

const COLLAPSE_MIN_LENGTH = 7;

/** "stuuurmfront" → "sturmfront". */
function collapseRepeats(value: string): string {
	return value.replace(/(.)\1+/g, "$1");
}

/** Words and numbers as separate tokens: "Team88" → ["team", "88"]. Digits stay digits here. */
export function nameTokens(value: string): string[] {
	return stripAccents(foldUmlauts(value))
		.split(/[^a-z0-9]+|(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/)
		.filter(Boolean);
}

export type TeamNameCheck = { ok: true } | { ok: false; term: string };

/** The matched term is for the orga log only; never show it to the captain. */
export function checkTeamName(value: string): TeamNameCheck {
	const symbol = BLOCKED_SYMBOLS.find((entry) => value.includes(entry));
	if (symbol) return { ok: false, term: symbol };

	const compact = compactName(value);
	const collapsed = collapseRepeats(compact);
	// Stretched letters only for long terms: collapsing short ones hits normal words
	// ("Spaßtruppe" → "spastrupe", "Minute" → "nute").
	const substring = SUBSTRING_TERMS.find(
		(term) => compact.includes(term) || (term.length >= COLLAPSE_MIN_LENGTH && collapsed.includes(collapseRepeats(term)))
	);
	if (substring) return { ok: false, term: substring };

	// Tokens are checked raw ("88") and with leetspeak mapped ("s5" → "ss").
	const tokens = nameTokens(value);
	const mappedTokens = tokens.map((token) => compactName(token)).filter(Boolean);
	const token = TOKEN_TERMS.find((term) => tokens.includes(term) || mappedTokens.includes(term));
	if (token) return { ok: false, term: token };

	return { ok: true };
}

/** Shown to captains. Neutral on purpose, so nobody can probe which word matched. */
export const BLOCKED_TEAM_NAME_MESSAGE = "Dieser Teamname ist nicht erlaubt. Bitte wähle einen anderen oder wende dich an die Orga.";
