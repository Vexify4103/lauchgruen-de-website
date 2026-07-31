export const COMMUNITY_OVERLAY_STYLES = ["default", "compact", "session", "banner", "rail", "portrait", "floating", "freeform"] as const;
export const COMMUNITY_OVERLAY_URL_VERSION = 1;
export type CommunityOverlayStyle = (typeof COMMUNITY_OVERLAY_STYLES)[number];

export const FREEFORM_ELEMENT_TYPES = ["identity", "rank", "session", "goal", "history", "liveGame"] as const;
export type FreeformElementType = (typeof FREEFORM_ELEMENT_TYPES)[number];

export type FreeformOverlayElement = {
	type: FreeformElementType;
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;
	textColor: string;
	accentColor: string;
	backgroundColor: string;
	borderColor: string;
	backgroundOpacity: number;
	showBackground: boolean;
	showBorder: boolean;
};

export const FREEFORM_CANVAS = { width: 1280, height: 720 } as const;

export const DEFAULT_FREEFORM_LAYOUT: FreeformOverlayElement[] = [
	{ type: "identity", x: 44, y: 38, width: 430, height: 92, zIndex: 1, textColor: "", accentColor: "", backgroundColor: "", borderColor: "", backgroundOpacity: 82, showBackground: true, showBorder: true },
	{ type: "rank", x: 44, y: 150, width: 360, height: 184, zIndex: 2, textColor: "", accentColor: "", backgroundColor: "", borderColor: "", backgroundOpacity: 82, showBackground: true, showBorder: true },
	{ type: "goal", x: 424, y: 150, width: 500, height: 126, zIndex: 3, textColor: "", accentColor: "", backgroundColor: "", borderColor: "", backgroundOpacity: 82, showBackground: true, showBorder: true },
	{ type: "session", x: 944, y: 38, width: 292, height: 238, zIndex: 4, textColor: "", accentColor: "", backgroundColor: "", borderColor: "", backgroundOpacity: 82, showBackground: true, showBorder: true },
	{ type: "history", x: 44, y: 362, width: 880, height: 306, zIndex: 5, textColor: "", accentColor: "", backgroundColor: "", borderColor: "", backgroundOpacity: 72, showBackground: true, showBorder: true },
	{ type: "liveGame", x: 944, y: 304, width: 292, height: 364, zIndex: 6, textColor: "", accentColor: "", backgroundColor: "", borderColor: "", backgroundOpacity: 72, showBackground: true, showBorder: true },
];

export const COMMUNITY_OVERLAY_GOALS = [
	{ value: "auto", label: "Automatisch · nächstes Tier" },
	{ value: "BRONZE", label: "Bronze IV" },
	{ value: "SILVER", label: "Silber IV" },
	{ value: "GOLD", label: "Gold IV" },
	{ value: "PLATINUM", label: "Platin IV" },
	{ value: "EMERALD", label: "Smaragd IV" },
	{ value: "DIAMOND", label: "Diamant IV" },
	{ value: "MASTER", label: "Master" },
	{ value: "GRANDMASTER", label: "Grandmaster" },
	{ value: "CHALLENGER", label: "Challenger" },
	{ value: "RANK_1", label: "Rang 1" },
] as const;
export type CommunityOverlayGoal = (typeof COMMUNITY_OVERLAY_GOALS)[number]["value"];

export const COMMUNITY_OVERLAY_REGIONS = [
	{ value: "euw1", label: "EU West" },
	{ value: "eun1", label: "EU Nordic & East" },
	{ value: "na1", label: "North America" },
	{ value: "kr", label: "Korea" },
	{ value: "br1", label: "Brazil" },
	{ value: "la1", label: "LAN" },
	{ value: "la2", label: "LAS" },
	{ value: "oc1", label: "Oceania" },
	{ value: "jp1", label: "Japan" },
	{ value: "tr1", label: "Türkiye" },
] as const;

export function normalizeTwitchLogin(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return "";

	let login = trimmed.replace(/^@/, "");
	if (/^(?:https?:\/\/)?(?:www\.)?twitch\.tv\//i.test(login)) {
		try {
			const url = new URL(/^https?:\/\//i.test(login) ? login : `https://${login}`);
			login = url.pathname.split("/").filter(Boolean)[0] ?? "";
		} catch {
			return "";
		}
	}

	return /^[a-z\d_]{1,40}$/i.test(login) ? login.toLowerCase() : "";
}

export type CommunityOverlayConfig = {
	streamer: string;
	ingame: string;
	accountId: string;
	region: string;
	style: CommunityOverlayStyle;
	primary: string;
	secondary: string;
	highlight: string;
	text: string;
	background: string;
	border: string;
	backgroundOpacity: number;
	showBackground: boolean;
	showBorder: boolean;
	showRank: boolean;
	showQueue: boolean;
	showWinRate: boolean;
	showGoal: boolean;
	goalTier: CommunityOverlayGoal;
	goalStartScore: number | null;
	goalStartLabel: string;
	goalStartLp: number | null;
	showHistory: boolean;
	sessionOnly: boolean;
	historyRows: 1 | 2 | 3;
	showLp: boolean;
	showBadges: boolean;
	flip: boolean;
	showLiveGame: boolean;
	showStreamerParticipants: boolean;
	hideOutsideLeague: boolean;
	rotateLastGame: boolean;
	freeformLayout: FreeformOverlayElement[];
};

export const DEFAULT_COMMUNITY_OVERLAY_CONFIG: CommunityOverlayConfig = {
	streamer: "",
	ingame: "",
	accountId: "",
	region: "euw1",
	style: "default",
	primary: "#b7f36b",
	secondary: "#58e0d2",
	highlight: "#ffd166",
	text: "#f1fff7",
	background: "#07140d",
	border: "#6fa96f",
	backgroundOpacity: 88,
	showBackground: true,
	showBorder: true,
	showRank: true,
	showQueue: true,
	showWinRate: true,
	showGoal: true,
	goalTier: "auto",
	goalStartScore: null,
	goalStartLabel: "",
	goalStartLp: null,
	showHistory: true,
	sessionOnly: true,
	historyRows: 1,
	showLp: true,
	showBadges: true,
	flip: false,
	showLiveGame: false,
	showStreamerParticipants: false,
	hideOutsideLeague: false,
	rotateLastGame: false,
	freeformLayout: DEFAULT_FREEFORM_LAYOUT.map((element) => ({ ...element })),
};

const HEX = /^#[0-9a-f]{6}$/i;

function color(value: string | null, fallback: string) {
	const normalized = value?.startsWith("#") ? value : value ? `#${value}` : "";
	return HEX.test(normalized) ? normalized.toLowerCase() : fallback;
}

function enabled(value: string | null, fallback: boolean) {
	if (value === null) return fallback;
	return value !== "0" && value !== "false";
}

const FREEFORM_MIN_WIDTH = 150;
const FREEFORM_MIN_HEIGHT = 72;

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function optionalColor(value: unknown) {
	return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : "";
}

function parseFreeformLayout(value: string | null) {
	if (!value) return DEFAULT_FREEFORM_LAYOUT.map((element) => ({ ...element }));
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed)) throw new Error("invalid layout");
		const seen = new Set<FreeformElementType>();
		const layout: FreeformOverlayElement[] = [];
		for (const candidate of parsed.slice(0, FREEFORM_ELEMENT_TYPES.length)) {
			if (!candidate || typeof candidate !== "object") continue;
			const item = candidate as Record<string, unknown>;
			const type = item.t as FreeformElementType;
			if (!FREEFORM_ELEMENT_TYPES.includes(type) || seen.has(type)) continue;
			const fallback = DEFAULT_FREEFORM_LAYOUT.find((element) => element.type === type)!;
			const width = boundedInteger(item.w, fallback.width, FREEFORM_MIN_WIDTH, FREEFORM_CANVAS.width);
			const height = boundedInteger(item.h, fallback.height, FREEFORM_MIN_HEIGHT, FREEFORM_CANVAS.height);
			layout.push({
				type,
				x: boundedInteger(item.x, fallback.x, 0, FREEFORM_CANVAS.width - width),
				y: boundedInteger(item.y, fallback.y, 0, FREEFORM_CANVAS.height - height),
				width,
				height,
				zIndex: boundedInteger(item.z, fallback.zIndex, 1, 20),
				textColor: optionalColor(item.tc),
				accentColor: optionalColor(item.ac),
				backgroundColor: optionalColor(item.bc),
				borderColor: optionalColor(item.rc),
				backgroundOpacity: boundedInteger(item.o, fallback.backgroundOpacity, 0, 100),
				showBackground: item.bg !== 0,
				showBorder: item.br !== 0,
			});
			seen.add(type);
		}
		return layout;
	} catch {
		return DEFAULT_FREEFORM_LAYOUT.map((element) => ({ ...element }));
	}
}

function serializeFreeformLayout(layout: FreeformOverlayElement[]) {
	return JSON.stringify(
		layout.map((element) => ({
			t: element.type,
			x: element.x,
			y: element.y,
			w: element.width,
			h: element.height,
			z: element.zIndex,
			...(element.textColor ? { tc: element.textColor } : {}),
			...(element.accentColor ? { ac: element.accentColor } : {}),
			...(element.backgroundColor ? { bc: element.backgroundColor } : {}),
			...(element.borderColor ? { rc: element.borderColor } : {}),
			o: element.backgroundOpacity,
			bg: element.showBackground ? 1 : 0,
			br: element.showBorder ? 1 : 0,
		}))
	);
}

export function parseCommunityOverlayConfig(params: URLSearchParams): CommunityOverlayConfig {
	const styleValue = params.get("style") as CommunityOverlayStyle | null;
	const style = COMMUNITY_OVERLAY_STYLES.includes(styleValue ?? "default") ? (styleValue ?? "default") : "default";
	const supportsLiveGame = style !== "banner" && style !== "rail" && style !== "portrait";
	const goalValue = params.get("goaltier") as CommunityOverlayGoal | null;
	const goalStartParam = params.get("goalstart");
	const goalStartScore = goalStartParam === null ? Number.NaN : Number(goalStartParam);
	const goalStartLpParam = params.get("goalstartlp");
	const goalStartLp = goalStartLpParam === null ? Number.NaN : Number(goalStartLpParam);
	const rows = Number(params.get("rows"));
	return {
		streamer: normalizeTwitchLogin(params.get("streamer") ?? ""),
		ingame: (params.get("ingame") ?? "").trim().slice(0, 64),
		// Values longer than 64 characters are legacy raw PUUID links. The API
		// migrates those once to our stable internal account id.
		accountId: /^[a-z\d_-]{12,128}$/i.test((params.get("account") ?? "").trim()) ? (params.get("account") ?? "").trim() : "",
		region: COMMUNITY_OVERLAY_REGIONS.some((region) => region.value === params.get("region")) ? params.get("region")! : "euw1",
		style,
		primary: color(params.get("primary"), DEFAULT_COMMUNITY_OVERLAY_CONFIG.primary),
		secondary: color(params.get("secondary"), DEFAULT_COMMUNITY_OVERLAY_CONFIG.secondary),
		highlight: color(params.get("highlight"), DEFAULT_COMMUNITY_OVERLAY_CONFIG.highlight),
		text: color(params.get("text"), DEFAULT_COMMUNITY_OVERLAY_CONFIG.text),
		background: color(params.get("background"), DEFAULT_COMMUNITY_OVERLAY_CONFIG.background),
		border: color(params.get("border"), DEFAULT_COMMUNITY_OVERLAY_CONFIG.border),
		backgroundOpacity: Math.max(0, Math.min(100, Number(params.get("opacity") ?? DEFAULT_COMMUNITY_OVERLAY_CONFIG.backgroundOpacity) || 0)),
		showBackground: enabled(params.get("showbg"), true),
		showBorder: enabled(params.get("showborder"), true),
		showRank: enabled(params.get("rank"), true),
		showQueue: enabled(params.get("queue"), true),
		showWinRate: enabled(params.get("winrate"), true),
		showGoal: enabled(params.get("goal"), true),
		goalTier: COMMUNITY_OVERLAY_GOALS.some((goal) => goal.value === goalValue) ? goalValue! : "auto",
		goalStartScore: Number.isFinite(goalStartScore) && goalStartScore >= 0 ? goalStartScore : null,
		goalStartLabel: (params.get("goalstartlabel") ?? "").trim().slice(0, 32),
		goalStartLp: Number.isFinite(goalStartLp) ? Math.max(0, Math.min(10_000, Math.round(goalStartLp))) : null,
		showHistory: enabled(params.get("history"), true),
		sessionOnly: enabled(params.get("session"), true),
		historyRows: rows === 2 || rows === 3 ? rows : 1,
		showLp: enabled(params.get("lp"), true),
		showBadges: enabled(params.get("badges"), true),
		flip: enabled(params.get("flip"), false),
		showLiveGame: supportsLiveGame && enabled(params.get("livegame"), false),
		showStreamerParticipants: enabled(params.get("streamers"), false),
		hideOutsideLeague: Boolean(normalizeTwitchLogin(params.get("streamer") ?? "")) && enabled(params.get("leagueonly"), false),
		rotateLastGame: style === "freeform" || style === "portrait" ? false : enabled(params.get("rotate"), false),
		freeformLayout: parseFreeformLayout(params.get("layout")),
	};
}

export function communityOverlayParams(config: CommunityOverlayConfig, preview = false) {
	const freeformTypes = config.style === "freeform" ? new Set(config.freeformLayout.map((element) => element.type)) : null;
	const params = new URLSearchParams({
		v: String(COMMUNITY_OVERLAY_URL_VERSION),
		streamer: config.streamer,
		region: config.region,
		style: config.style,
		primary: config.primary.slice(1),
		secondary: config.secondary.slice(1),
		highlight: config.highlight.slice(1),
		text: config.text.slice(1),
		background: config.background.slice(1),
		border: config.border.slice(1),
		opacity: String(config.backgroundOpacity),
		showbg: config.showBackground ? "1" : "0",
		showborder: config.showBorder ? "1" : "0",
		rank: config.showRank ? "1" : "0",
		queue: config.showQueue ? "1" : "0",
		winrate: config.showWinRate ? "1" : "0",
		goal: config.showGoal || freeformTypes?.has("goal") ? "1" : "0",
		goaltier: config.goalTier,
		history: config.showHistory || freeformTypes?.has("history") ? "1" : "0",
		session: config.sessionOnly ? "1" : "0",
		rows: String(config.historyRows),
		lp: config.showLp ? "1" : "0",
		badges: config.showBadges ? "1" : "0",
		flip: config.flip ? "1" : "0",
		livegame: config.style !== "banner" && config.style !== "rail" && config.style !== "portrait" && (config.showLiveGame || freeformTypes?.has("liveGame")) ? "1" : "0",
		streamers: config.showStreamerParticipants ? "1" : "0",
		leagueonly: config.streamer && config.hideOutsideLeague ? "1" : "0",
		rotate: config.style !== "freeform" && config.style !== "portrait" && config.rotateLastGame ? "1" : "0",
	});
	if (config.accountId) params.set("account", config.accountId);
	else params.set("ingame", config.ingame);
	if (config.style === "freeform") params.set("layout", serializeFreeformLayout(config.freeformLayout));
	if (config.goalStartScore !== null) params.set("goalstart", String(config.goalStartScore));
	if (config.goalStartLabel) params.set("goalstartlabel", config.goalStartLabel);
	if (config.goalStartLp !== null) params.set("goalstartlp", String(config.goalStartLp));
	if (preview) params.set("preview", "1");
	return params;
}
