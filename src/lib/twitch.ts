/**
 * Twitch Helix API helpers — for the landing page's live-status widget.
 *
 * Uses the SAME TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET that drive OAuth
 * sign-in, but with the client_credentials grant (app token) instead of
 * the user-auth flow. App tokens are valid ~60 days; we cache + refresh
 * lazily.
 *
 * Stream + user data are also cached briefly so polling clients can't
 * hammer Helix every page load — we honor Twitch's rate limits.
 */

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STREAMS_URL = "https://api.twitch.tv/helix/streams";
const USERS_URL = "https://api.twitch.tv/helix/users";
const CLIPS_URL = "https://api.twitch.tv/helix/clips";

const STREAM_CACHE_MS = 30_000; // poll Twitch at most once per 30s
const STREAM_ERROR_RETRY_MS = 60_000;
const USER_CACHE_MS = 60 * 60_000; // user info changes rarely — 1h
const CLIPS_CACHE_MS = 10 * 60_000; // clips list refreshes every ~10 min
const CLIP_ARCHIVE_START = "2016-01-01T00:00:00.000Z";
const MAX_ARCHIVE_CLIPS = 1_000;

interface AppToken {
	accessToken: string;
	expiresAt: number; // epoch ms
}

interface CachedStream<T> {
	data: T;
	expiresAt: number;
}

export type TwitchCredentialScope = "default" | "overlay";

// Stash on globalThis so `tsx watch` hot-reloads don't blow caches.
const g = globalThis as unknown as {
	__qd_twitch_token?: AppToken;
	__qd_twitch_overlay_token?: AppToken;
	__qd_twitch_stream?: Map<string, CachedStream<TwitchStream | null>>;
	__qd_twitch_stream_requests?: Map<string, Promise<TwitchStream | null>>;
	__qd_twitch_user?: Map<string, CachedStream<TwitchUser | null>>;
	__qd_twitch_clips?: Map<string, CachedStream<TwitchClip[]>>;
	__qd_twitch_clip_requests?: Map<string, Promise<TwitchClip[]>>;
};
g.__qd_twitch_stream ??= new Map();
g.__qd_twitch_stream_requests ??= new Map();
g.__qd_twitch_user ??= new Map();
g.__qd_twitch_clips ??= new Map();
g.__qd_twitch_clip_requests ??= new Map();
const streamCache = g.__qd_twitch_stream!;
const userCache = g.__qd_twitch_user!;
const clipsCache = g.__qd_twitch_clips!;
const clipRequests = g.__qd_twitch_clip_requests!;

export interface TwitchStream {
	id: string;
	userName: string;
	gameName: string;
	title: string;
	viewerCount: number;
	startedAt: string;
	thumbnailUrl: string; // 320x180 (placeholders pre-filled)
	language: string;
}

export interface TwitchClip {
	id: string;
	url: string;
	embedUrl: string;
	title: string;
	thumbnailUrl: string;
	viewCount: number;
	durationSec: number;
	createdAt: string;
	creatorName: string;
	gameId: string;
}

export type TwitchClipCollection = "recent" | "popular";

export interface TwitchUser {
	id: string;
	login: string;
	displayName: string;
	profileImageUrl: string;
	offlineImageUrl: string;
	description: string;
}

function credentials(scope: TwitchCredentialScope) {
	const id = scope === "overlay" ? process.env.TWITCH_OVERLAY_CLIENT_ID : process.env.TWITCH_CLIENT_ID;
	const secret = scope === "overlay" ? process.env.TWITCH_OVERLAY_CLIENT_SECRET : process.env.TWITCH_CLIENT_SECRET;
	return { id, secret };
}

async function getAppToken(scope: TwitchCredentialScope = "default"): Promise<string | null> {
	const { id, secret } = credentials(scope);
	if (!id || !secret) {
		if (scope === "overlay") throw new Error("TWITCH_OVERLAY_CLIENT_ID oder TWITCH_OVERLAY_CLIENT_SECRET fehlt.");
		console.warn("[twitch] missing TWITCH_CLIENT_ID/SECRET — skipping");
		return null;
	}
	const tokenKey = scope === "overlay" ? "__qd_twitch_overlay_token" : "__qd_twitch_token";

	// 60s buffer so we don't race the expiry.
	if (g[tokenKey] && g[tokenKey].expiresAt > Date.now() + 60_000) {
		return g[tokenKey].accessToken;
	}

	const body = new URLSearchParams({
		client_id: id,
		client_secret: secret,
		grant_type: "client_credentials",
	});
	const r = await fetch(TOKEN_URL, { method: "POST", body });
	if (!r.ok) {
		console.error("[twitch] token request failed:", r.status, await r.text());
		return null;
	}
	const json = (await r.json()) as { access_token: string; expires_in: number };
	g[tokenKey] = {
		accessToken: json.access_token,
		expiresAt: Date.now() + json.expires_in * 1000,
	};
	return json.access_token;
}

/** Fetch helper that injects auth headers. */
async function helix(url: string, scope: TwitchCredentialScope = "default"): Promise<unknown | null> {
	const token = await getAppToken(scope);
	if (!token) return null;
	const { id } = credentials(scope);
	const r = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			"Client-Id": id!,
		},
	});
	if (r.status === 401) {
		// Token expired or revoked — drop cache + retry once.
		if (scope === "overlay") g.__qd_twitch_overlay_token = undefined;
		else g.__qd_twitch_token = undefined;
		const retryToken = await getAppToken(scope);
		if (!retryToken) return null;
		const r2 = await fetch(url, {
			headers: {
				Authorization: `Bearer ${retryToken}`,
				"Client-Id": id!,
			},
		});
		if (!r2.ok) return null;
		return r2.json();
	}
	if (!r.ok) {
		console.error("[twitch] helix request failed:", r.status, url);
		return null;
	}
	return r.json();
}

/**
 * Returns the current live stream for `login`, or null if offline / error.
 * Result is cached for 30 seconds — safe to call from a hot endpoint.
 */
export async function getStream(login: string, scope: TwitchCredentialScope = "default"): Promise<TwitchStream | null> {
	const loginKey = login.toLowerCase();
	const key = scope === "overlay" ? `overlay:${loginKey}` : loginKey;
	const cached = streamCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	const pending = g.__qd_twitch_stream_requests?.get(key);
	if (pending) return pending;

	const request = (async () => {
		try {
			const json = (await helix(`${STREAMS_URL}?user_login=${encodeURIComponent(login)}`, scope)) as {
				data: Array<{
					id: string;
					user_name: string;
					game_name: string;
					title: string;
					viewer_count: number;
					started_at: string;
					thumbnail_url: string;
					language: string;
				}>;
			} | null;

			let data: TwitchStream | null = null;
			if (json?.data?.[0]) {
				const s = json.data[0];
				data = {
					id: s.id,
					userName: s.user_name,
					gameName: s.game_name,
					title: s.title,
					viewerCount: s.viewer_count,
					startedAt: s.started_at,
					// Helix returns the URL with {width} / {height} placeholders.
					thumbnailUrl: s.thumbnail_url.replace("{width}", "640").replace("{height}", "360"),
					language: s.language,
				};
			}

			streamCache.set(key, { data, expiresAt: Date.now() + STREAM_CACHE_MS });
			return data;
		} catch (error) {
			// Keep OBS stable during short Twitch/CloudFront outages. An expired
			// cached value is safer than flashing an active source on and off.
			const stale = streamCache.get(key)?.data ?? null;
			streamCache.set(key, { data: stale, expiresAt: Date.now() + STREAM_ERROR_RETRY_MS });
			const reason = error instanceof Error ? error.message : String(error);
			console.warn(`[twitch] Stream-Abfrage für ${loginKey} fehlgeschlagen; letzter Stand wird verwendet (${reason}).`);
			return stale;
		}
	})().finally(() => g.__qd_twitch_stream_requests?.delete(key));

	g.__qd_twitch_stream_requests?.set(key, request);
	return request;
}

/**
 * Returns live streams for many logins in one Helix request. Twitch accepts up
 * to 100 user_login parameters, so a full tournament fits comfortably.
 */
export async function getStreams(logins: string[]): Promise<Map<string, TwitchStream>> {
	const uniqueLogins = [...new Set(logins.map((login) => login.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
	const result = new Map<string, TwitchStream>();
	const missing: string[] = [];

	for (const login of uniqueLogins) {
		const cached = streamCache.get(login);
		if (cached && cached.expiresAt > Date.now()) {
			if (cached.data) result.set(login, cached.data);
		} else {
			missing.push(login);
		}
	}

	if (missing.length === 0) return result;

	const params = new URLSearchParams();
	for (const login of missing) params.append("user_login", login);
	const json = (await helix(`${STREAMS_URL}?${params.toString()}`)) as {
		data: Array<{
			id: string;
			user_login: string;
			user_name: string;
			game_name: string;
			title: string;
			viewer_count: number;
			started_at: string;
			thumbnail_url: string;
			language: string;
		}>;
	} | null;

	const found = new Map<string, TwitchStream>();
	for (const stream of json?.data ?? []) {
		const data: TwitchStream = {
			id: stream.id,
			userName: stream.user_name,
			gameName: stream.game_name,
			title: stream.title,
			viewerCount: stream.viewer_count,
			startedAt: stream.started_at,
			thumbnailUrl: stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360"),
			language: stream.language,
		};
		found.set(stream.user_login.toLowerCase(), data);
		result.set(stream.user_login.toLowerCase(), data);
	}

	for (const login of missing) {
		streamCache.set(login, {
			data: found.get(login) ?? null,
			expiresAt: Date.now() + STREAM_CACHE_MS,
		});
	}

	return result;
}

/**
 * Returns Twitch user info (display name, avatar, bio) for `login`.
 * Cached for 1 hour.
 */
export async function getUser(login: string, scope: TwitchCredentialScope = "default"): Promise<TwitchUser | null> {
	const loginKey = login.toLowerCase();
	const key = scope === "overlay" ? `overlay:${loginKey}` : loginKey;
	const cached = userCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	const json = (await helix(`${USERS_URL}?login=${encodeURIComponent(login)}`, scope)) as {
		data: Array<{
			id: string;
			login: string;
			display_name: string;
			profile_image_url: string;
			offline_image_url: string;
			description: string;
		}>;
	} | null;

	let data: TwitchUser | null = null;
	if (json?.data?.[0]) {
		const u = json.data[0];
		data = {
			id: u.id,
			login: u.login,
			displayName: u.display_name,
			profileImageUrl: u.profile_image_url,
			offlineImageUrl: u.offline_image_url,
			description: u.description,
		};
	}

	userCache.set(key, { data, expiresAt: Date.now() + USER_CACHE_MS });
	return data;
}

function mapClip(clip: {
	id: string;
	url: string;
	embed_url: string;
	title: string;
	thumbnail_url: string;
	view_count: number;
	duration: number;
	created_at: string;
	creator_name: string;
	game_id: string;
}): TwitchClip {
	return {
		id: clip.id,
		url: clip.url,
		embedUrl: clip.embed_url,
		title: clip.title,
		thumbnailUrl: clip.thumbnail_url,
		viewCount: clip.view_count,
		durationSec: clip.duration,
		createdAt: clip.created_at,
		creatorName: clip.creator_name,
		gameId: clip.game_id,
	};
}

async function fetchClipCollection(broadcasterId: string, collection: TwitchClipCollection): Promise<TwitchClip[]> {
	const clips: TwitchClip[] = [];
	const startedAt = collection === "recent" ? new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString() : CLIP_ARCHIVE_START;
	const maxResults = collection === "recent" ? 100 : MAX_ARCHIVE_CLIPS;
	let cursor = "";

	do {
		const params = new URLSearchParams({
			broadcaster_id: broadcasterId,
			first: String(Math.min(100, maxResults - clips.length)),
			started_at: startedAt,
			ended_at: new Date().toISOString(),
		});
		if (cursor) params.set("after", cursor);

		const json = (await helix(`${CLIPS_URL}?${params.toString()}`)) as {
			data?: Array<Parameters<typeof mapClip>[0]>;
			pagination?: { cursor?: string };
		} | null;
		const page = json?.data ?? [];
		clips.push(...page.map(mapClip));
		cursor = json?.pagination?.cursor ?? "";
		if (page.length === 0) break;
	} while (cursor && clips.length < maxResults);

	return clips;
}

/**
 * Returns either the last 30 days or the channel's most popular clip archive.
 * Twitch returns clips ordered by views; callers can sort the cached result by
 * date without issuing another Helix request.
 */
export async function getClipCollection(login: string, collection: TwitchClipCollection): Promise<TwitchClip[]> {
	const loginKey = login.toLowerCase();
	const key = `${loginKey}|${collection}`;
	const cached = clipsCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	const pending = clipRequests.get(key);
	if (pending) return pending;

	const request = (async () => {
		const user = await getUser(loginKey);
		const data = user ? await fetchClipCollection(user.id, collection) : [];
		clipsCache.set(key, { data, expiresAt: Date.now() + CLIPS_CACHE_MS });
		return data;
	})().finally(() => clipRequests.delete(key));

	clipRequests.set(key, request);
	return request;
}

/**
 * Homepage selection: prefer clips from the last 30 days and fill empty slots
 * with popular older highlights.
 */
export async function getClips(login: string, count = 6): Promise<{ clips: TwitchClip[]; usedPopularFallback: boolean }> {
	const recent = (await getClipCollection(login, "recent")).slice(0, count);
	if (recent.length >= count) return { clips: recent, usedPopularFallback: false };

	const popular = await getClipCollection(login, "popular");
	return selectHomepageClips(recent, popular, count);
}

export function selectHomepageClips(recent: TwitchClip[], popular: TwitchClip[], count: number): { clips: TwitchClip[]; usedPopularFallback: boolean } {
	const seen = new Set(recent.map((clip) => clip.id));
	const fallback = popular.filter((clip) => !seen.has(clip.id)).slice(0, count - recent.length);
	return { clips: [...recent, ...fallback], usedPopularFallback: fallback.length > 0 };
}
