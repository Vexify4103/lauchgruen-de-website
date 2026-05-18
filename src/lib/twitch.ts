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

const TOKEN_URL    = "https://id.twitch.tv/oauth2/token";
const STREAMS_URL  = "https://api.twitch.tv/helix/streams";
const USERS_URL    = "https://api.twitch.tv/helix/users";
const CLIPS_URL    = "https://api.twitch.tv/helix/clips";

const STREAM_CACHE_MS = 30_000;   // poll Twitch at most once per 30s
const USER_CACHE_MS   = 60 * 60_000; // user info changes rarely — 1h
const CLIPS_CACHE_MS  = 10 * 60_000; // clips list refreshes every ~10 min

interface AppToken {
  accessToken: string;
  expiresAt:   number; // epoch ms
}

interface CachedStream<T> {
  data:      T;
  expiresAt: number;
}

// Stash on globalThis so `tsx watch` hot-reloads don't blow caches.
const g = globalThis as unknown as {
  __qd_twitch_token?:  AppToken;
  __qd_twitch_stream?: Map<string, CachedStream<TwitchStream | null>>;
  __qd_twitch_user?:   Map<string, CachedStream<TwitchUser | null>>;
  __qd_twitch_clips?:  Map<string, CachedStream<TwitchClip[]>>;
};
g.__qd_twitch_stream ??= new Map();
g.__qd_twitch_user   ??= new Map();
g.__qd_twitch_clips  ??= new Map();
const streamCache = g.__qd_twitch_stream!;
const userCache   = g.__qd_twitch_user!;
const clipsCache  = g.__qd_twitch_clips!;

export interface TwitchStream {
  id:           string;
  userName:     string;
  gameName:     string;
  title:        string;
  viewerCount:  number;
  startedAt:    string;
  thumbnailUrl: string; // 320x180 (placeholders pre-filled)
  language:     string;
}

export interface TwitchClip {
  id:            string;
  url:           string;
  embedUrl:      string;
  title:         string;
  thumbnailUrl:  string;
  viewCount:     number;
  durationSec:   number;
  createdAt:     string;
  creatorName:   string;
  gameId:        string;
}

export interface TwitchUser {
  id:               string;
  login:            string;
  displayName:      string;
  profileImageUrl:  string;
  offlineImageUrl:  string;
  description:      string;
}

async function getAppToken(): Promise<string | null> {
  const id     = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) {
    console.warn("[twitch] missing TWITCH_CLIENT_ID/SECRET — skipping");
    return null;
  }

  // 60s buffer so we don't race the expiry.
  if (g.__qd_twitch_token && g.__qd_twitch_token.expiresAt > Date.now() + 60_000) {
    return g.__qd_twitch_token.accessToken;
  }

  const body = new URLSearchParams({
    client_id:     id,
    client_secret: secret,
    grant_type:    "client_credentials",
  });
  const r = await fetch(TOKEN_URL, { method: "POST", body });
  if (!r.ok) {
    console.error("[twitch] token request failed:", r.status, await r.text());
    return null;
  }
  const json = (await r.json()) as { access_token: string; expires_in: number };
  g.__qd_twitch_token = {
    accessToken: json.access_token,
    expiresAt:   Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

/** Fetch helper that injects auth headers. */
async function helix(url: string): Promise<unknown | null> {
  const token = await getAppToken();
  if (!token) return null;
  const r = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Client-Id":     process.env.TWITCH_CLIENT_ID!,
    },
  });
  if (r.status === 401) {
    // Token expired or revoked — drop cache + retry once.
    g.__qd_twitch_token = undefined;
    const retryToken = await getAppToken();
    if (!retryToken) return null;
    const r2 = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${retryToken}`,
        "Client-Id":     process.env.TWITCH_CLIENT_ID!,
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
export async function getStream(login: string): Promise<TwitchStream | null> {
  const key = login.toLowerCase();
  const cached = streamCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const json = (await helix(`${STREAMS_URL}?user_login=${encodeURIComponent(login)}`)) as
    | { data: Array<{
        id: string; user_name: string; game_name: string; title: string;
        viewer_count: number; started_at: string; thumbnail_url: string;
        language: string;
      }> }
    | null;

  let data: TwitchStream | null = null;
  if (json?.data?.[0]) {
    const s = json.data[0];
    data = {
      id:           s.id,
      userName:     s.user_name,
      gameName:     s.game_name,
      title:        s.title,
      viewerCount:  s.viewer_count,
      startedAt:    s.started_at,
      // Helix returns the URL with {width} / {height} placeholders.
      thumbnailUrl: s.thumbnail_url
        .replace("{width}", "640")
        .replace("{height}", "360"),
      language:     s.language,
    };
  }

  streamCache.set(key, { data, expiresAt: Date.now() + STREAM_CACHE_MS });
  return data;
}

/**
 * Returns Twitch user info (display name, avatar, bio) for `login`.
 * Cached for 1 hour.
 */
export async function getUser(login: string): Promise<TwitchUser | null> {
  const key = login.toLowerCase();
  const cached = userCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const json = (await helix(`${USERS_URL}?login=${encodeURIComponent(login)}`)) as
    | { data: Array<{
        id: string; login: string; display_name: string;
        profile_image_url: string; offline_image_url: string;
        description: string;
      }> }
    | null;

  let data: TwitchUser | null = null;
  if (json?.data?.[0]) {
    const u = json.data[0];
    data = {
      id:              u.id,
      login:           u.login,
      displayName:     u.display_name,
      profileImageUrl: u.profile_image_url,
      offlineImageUrl: u.offline_image_url,
      description:     u.description,
    };
  }

  userCache.set(key, { data, expiresAt: Date.now() + USER_CACHE_MS });
  return data;
}

/**
 * Returns the most-viewed clips for `login` from roughly the last 30 days.
 * Result is cached for 10 minutes.
 */
export async function getClips(login: string, count = 6): Promise<TwitchClip[]> {
  const key = `${login.toLowerCase()}|${count}`;
  const cached = clipsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const user = await getUser(login);
  if (!user) {
    clipsCache.set(key, { data: [], expiresAt: Date.now() + CLIPS_CACHE_MS });
    return [];
  }

  const startedAt = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const url = `${CLIPS_URL}?broadcaster_id=${encodeURIComponent(user.id)}&first=${count}&started_at=${encodeURIComponent(startedAt)}`;
  const json = (await helix(url)) as
    | { data: Array<{
        id: string; url: string; embed_url: string; title: string;
        thumbnail_url: string; view_count: number; duration: number;
        created_at: string; creator_name: string; game_id: string;
      }> }
    | null;

  const data: TwitchClip[] = (json?.data ?? []).map((c) => ({
    id:           c.id,
    url:          c.url,
    embedUrl:     c.embed_url,
    title:        c.title,
    thumbnailUrl: c.thumbnail_url,
    viewCount:    c.view_count,
    durationSec:  c.duration,
    createdAt:    c.created_at,
    creatorName:  c.creator_name,
    gameId:       c.game_id,
  }));

  clipsCache.set(key, { data, expiresAt: Date.now() + CLIPS_CACHE_MS });
  return data;
}
