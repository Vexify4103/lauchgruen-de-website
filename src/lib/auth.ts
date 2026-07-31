import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";

declare module "next-auth" {
	interface Session {
		user: {
			id: string;
			discordId?: string;
			discordHandle?: string;
			discordUsername?: string;
			discordAvatar?: string;
			discordInGuild?: boolean;
		} & DefaultSession["user"];
	}
}

type DiscordProfile = {
	id?: string;
	username?: string;
	global_name?: string | null;
	discriminator?: string;
	avatar?: string | null;
};

type DiscordToken = {
	discordId?: string;
	discordHandle?: string;
	discordUsername?: string;
	discordAvatar?: string;
	discordInGuild?: boolean;
};

function isLauchgruenDomain(hostname: string) {
	return hostname === "lauchgruen.de" || hostname.endsWith(".lauchgruen.de");
}

function isLocalLauchgruenDomain(hostname: string) {
	return hostname === "lauchgruen.localhost" || hostname.endsWith(".lauchgruen.localhost");
}

function getAuthRedirectProxyUrl() {
	const configured = process.env.AUTH_REDIRECT_PROXY_URL?.trim();
	if (!configured) return "";

	try {
		const proxyUrl = new URL(configured);
		const publicAuthUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();

		// A redirect proxy is only useful when callbacks run through a different
		// deployment. Pointing it at this app or another Lauchgruen subdomain adds
		// a second state flow and can leave the callback with an unreadable cookie.
		if (publicAuthUrl) {
			const authUrl = new URL(publicAuthUrl);
			if (proxyUrl.origin === authUrl.origin) return "";
			if (isLauchgruenDomain(proxyUrl.hostname) && isLauchgruenDomain(authUrl.hostname)) return "";
			if (isLocalLauchgruenDomain(proxyUrl.hostname) && isLocalLauchgruenDomain(authUrl.hostname)) return "";
		}
		return proxyUrl.toString().replace(/\/$/, "");
	} catch {
		return "";
	}
}

function authStateCookieName() {
	const publicAuthUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
	const secure = publicAuthUrl?.startsWith("https://") ?? false;
	return `${secure ? "__Secure-" : ""}lauchgruen.authjs.state`;
}

function sharedStateCookie() {
	const publicAuthUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
	const secure = publicAuthUrl?.startsWith("https://") ?? false;
	let domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
	if (!domain && publicAuthUrl) {
		try {
			const hostname = new URL(publicAuthUrl).hostname;
			if (isLauchgruenDomain(hostname)) domain = ".lauchgruen.de";
			if (isLocalLauchgruenDomain(hostname)) domain = ".lauchgruen.localhost";
		} catch {
			// Auth.js reports malformed public URLs separately.
		}
	}
	return {
		name: authStateCookieName(),
		options: {
			httpOnly: true,
			sameSite: "lax" as const,
			path: "/",
			secure,
			maxAge: 900,
			...(domain ? { domain } : {}),
		},
	};
}

function isAllowedAccountRedirect(url: string, baseUrl: string) {
	try {
		const target = new URL(url, baseUrl);
		const base = new URL(baseUrl);
		if (target.origin === base.origin) return true;
		const productionPair = isLauchgruenDomain(target.hostname) && isLauchgruenDomain(base.hostname);
		const localPair = isLocalLauchgruenDomain(target.hostname) && isLocalLauchgruenDomain(base.hostname) && target.port === base.port;
		return target.protocol === base.protocol && (productionPair || localPair);
	} catch {
		return false;
	}
}

function sharedSessionCookie() {
	const publicAuthUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
	const secure = publicAuthUrl?.startsWith("https://") ?? false;
	let domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
	if (!domain && publicAuthUrl) {
		try {
			const hostname = new URL(publicAuthUrl).hostname;
			if (isLauchgruenDomain(hostname)) domain = ".lauchgruen.de";
			if (isLocalLauchgruenDomain(hostname)) domain = ".lauchgruen.localhost";
		} catch {
			// Invalid AUTH_URL is reported by Auth.js; keep local cookie defaults here.
		}
	}
	return {
		name: `${secure ? "__Secure-" : ""}authjs.session-token`,
		options: {
			httpOnly: true,
			sameSite: "lax" as const,
			path: "/",
			secure,
			...(domain ? { domain } : {}),
		},
	};
}

export const { handlers, auth, signIn, signOut } = NextAuth({
	trustHost: true,
	redirectProxyUrl: getAuthRedirectProxyUrl(),
	cookies: {
		state: sharedStateCookie(),
		sessionToken: sharedSessionCookie(),
	},
	providers: [
		Discord({
			clientId: process.env.DISCORD_CLIENT_ID,
			clientSecret: process.env.DISCORD_CLIENT_SECRET,
			authorization: { params: { scope: "identify email guilds" } },
			checks: ["state"],
		}),
	],
	callbacks: {
		async redirect({ url, baseUrl }) {
			if (process.env.AUTH_DEBUG === "true") {
				console.log("[auth:redirect]", { url, baseUrl });
			}

			if (url.startsWith("/")) return `${baseUrl}${url}`;
			return isAllowedAccountRedirect(url, baseUrl) ? url : baseUrl;
		},
		async jwt({ token, profile, account }) {
			const appToken = token as typeof token & DiscordToken;

			if (profile) {
				const dp = profile as DiscordProfile;
				const username = dp.username ?? (typeof token.name === "string" ? token.name : "");
				const discriminator = dp.discriminator && dp.discriminator !== "0" ? `#${dp.discriminator}` : "";

				appToken.discordId = dp.id;
				appToken.discordUsername = username;
				appToken.discordHandle = `${dp.global_name ?? username}${discriminator}`;
				appToken.discordAvatar = dp.id && dp.avatar ? `https://cdn.discordapp.com/avatars/${dp.id}/${dp.avatar}.png?size=128` : undefined;
			}

			if (account?.access_token) {
				const requiredGuildId = process.env.DISCORD_GUILD_ID;
				appToken.discordInGuild = true;
				if (requiredGuildId) {
					const response = await fetch("https://discord.com/api/users/@me/guilds", {
						headers: { authorization: `Bearer ${account.access_token}` },
					});
					if (response.ok) {
						const guilds = (await response.json()) as Array<{ id?: string }>;
						appToken.discordInGuild = guilds.some((guild) => guild.id === requiredGuildId);
					} else {
						appToken.discordInGuild = false;
					}
				}
			}

			return appToken;
		},
		async session({ session, token }) {
			const appToken = token as typeof token & DiscordToken;

			if (token.sub) session.user.id = token.sub;
			session.user.discordId = typeof appToken.discordId === "string" ? appToken.discordId : undefined;
			session.user.discordUsername = typeof appToken.discordUsername === "string" ? appToken.discordUsername : undefined;
			session.user.discordHandle = typeof appToken.discordHandle === "string" ? appToken.discordHandle : undefined;
			session.user.discordAvatar = typeof appToken.discordAvatar === "string" ? appToken.discordAvatar : undefined;
			session.user.discordInGuild = typeof appToken.discordInGuild === "boolean" ? appToken.discordInGuild : undefined;
			return session;
		},
	},
});
