import { decode } from "@auth/core/jwt";

export interface AuthedIdentity {
  userId: string;
  twitchLogin: string;
  displayName: string;
  avatarUrl: string;
}

const COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function decodeSessionFromCookie(
  cookieHeader: string | undefined,
): Promise<AuthedIdentity | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.warn("[socket-auth] AUTH_SECRET not set");
    return null;
  }
  const cookies = parseCookies(cookieHeader);
  for (const name of COOKIE_NAMES) {
    const token = cookies[name];
    if (!token) continue;
    try {
      const payload = await decode({
        token,
        secret,
        salt: name,
      });
      if (!payload?.sub) continue;
      const twitchLogin =
        (typeof payload.twitchLogin === "string" && payload.twitchLogin) ||
        (typeof payload.name === "string" && payload.name) ||
        "";
      return {
        userId: payload.sub,
        twitchLogin,
        displayName: (typeof payload.name === "string" && payload.name) || twitchLogin,
        avatarUrl: (typeof payload.picture === "string" && payload.picture) || "",
      };
    } catch (err) {
      console.warn(`[socket-auth] decode failed for ${name}:`, err);
    }
  }
  return null;
}
