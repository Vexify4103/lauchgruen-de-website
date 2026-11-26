import { getSiteUrls } from "@/lib/site-urls";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

export type TwitchReturnSource = "main" | "overlay" | "tournament" | "winchallenge" | "winchallenge-einsatz";

export type LinkedTwitchIdentity = {
	twitchUserId: string;
	login: string;
	displayName: string;
	profileImageUrl: string;
};

export function getTwitchLinkRedirectUri(requestUrl?: string): string {
	const configured = process.env.TWITCH_LINK_REDIRECT_URI?.trim();
	if (configured) {
		const redirect = new URL(configured);
		if (!["/api/twitch/callback", "/api/tournament/twitch/callback"].includes(redirect.pathname)) {
			throw new Error("TWITCH_LINK_REDIRECT_URI muss auf /api/twitch/callback enden.");
		}
		return redirect.toString();
	}

	if (requestUrl) {
		const request = new URL(requestUrl);
		if (request.hostname.endsWith(".localhost")) {
			const port = request.port ? `:${request.port}` : "";
			return `http://localhost${port}/api/twitch/callback`;
		}
	}

	const authUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
	if (authUrl) {
		return `${authUrl.replace(/\/$/, "")}/api/twitch/callback`;
	}

	if (requestUrl) {
		return new URL("/api/twitch/callback", requestUrl).toString();
	}

	throw new Error("TWITCH_LINK_REDIRECT_URI oder AUTH_URL fehlt.");
}

export function getTwitchAuthorizeUrl(input: { state: string; redirectUri: string; scope?: string }): string {
	const clientId = process.env.TWITCH_CLIENT_ID?.trim();
	if (!clientId) throw new Error("TWITCH_CLIENT_ID fehlt.");

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: input.redirectUri,
		response_type: "code",
		scope: input.scope ?? "",
		state: input.state,
		force_verify: "true",
	});
	return `${TWITCH_AUTHORIZE_URL}?${params.toString()}`;
}

export type TwitchUserToken = { accessToken: string; refreshToken: string; expiresIn: number };

export async function exchangeTwitchCode(input: { code: string; redirectUri: string }): Promise<LinkedTwitchIdentity> {
	return (await exchangeTwitchCodeWithToken(input)).identity;
}

/** Like exchangeTwitchCode, but also returns the user token. Only for flows that store it server-side. */
export async function exchangeTwitchCodeWithToken(input: { code: string; redirectUri: string }): Promise<{ identity: LinkedTwitchIdentity; token: TwitchUserToken }> {
	const clientId = process.env.TWITCH_CLIENT_ID?.trim();
	const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) {
		throw new Error("Twitch OAuth ist nicht konfiguriert.");
	}

	const tokenResponse = await fetch(TWITCH_TOKEN_URL, {
		method: "POST",
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code: input.code,
			grant_type: "authorization_code",
			redirect_uri: input.redirectUri,
		}),
		cache: "no-store",
	});
	if (!tokenResponse.ok) {
		throw new Error(`Twitch Token-Austausch fehlgeschlagen (${tokenResponse.status}).`);
	}

	const tokenJson = (await tokenResponse.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
	if (!tokenJson.access_token) {
		throw new Error("Twitch hat kein Zugriffstoken zurückgegeben.");
	}

	const userResponse = await fetch(TWITCH_USERS_URL, {
		headers: {
			Authorization: `Bearer ${tokenJson.access_token}`,
			"Client-Id": clientId,
		},
		cache: "no-store",
	});
	if (!userResponse.ok) {
		throw new Error(`Twitch-Profil konnte nicht geladen werden (${userResponse.status}).`);
	}

	const userJson = (await userResponse.json()) as {
		data?: Array<{
			id: string;
			login: string;
			display_name: string;
			profile_image_url: string;
		}>;
	};
	const user = userJson.data?.[0];
	if (!user) throw new Error("Twitch-Profil wurde nicht gefunden.");

	return {
		identity: {
			twitchUserId: user.id,
			login: user.login,
			displayName: user.display_name,
			profileImageUrl: user.profile_image_url,
		},
		token: { accessToken: tokenJson.access_token, refreshToken: tokenJson.refresh_token ?? "", expiresIn: tokenJson.expires_in ?? 3600 },
	};
}

export function getTwitchLinkReturnUrl(requestUrl: string, status: string, returnSource?: TwitchReturnSource): URL {
	const configuredAuthUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
	const configuredRedirectUri = process.env.TWITCH_LINK_REDIRECT_URI?.trim();
	const publicOrigin = configuredAuthUrl ? new URL(configuredAuthUrl).origin : configuredRedirectUri ? new URL(configuredRedirectUri).origin : new URL(requestUrl).origin;
	const path = returnSource === "winchallenge" ? "/winchallenge/mitmachen" : returnSource === "winchallenge-einsatz" ? "/winchallenge/einsatz" : "/me";
	const url = new URL(path, getSiteUrls(new URL(publicOrigin).host).apex);
	url.searchParams.set("twitch", status);
	if (returnSource) url.searchParams.set("from", returnSource);
	return url;
}
