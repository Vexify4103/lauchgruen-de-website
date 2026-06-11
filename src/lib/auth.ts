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

function getAuthRedirectProxyUrl() {
  const configured = process.env.AUTH_REDIRECT_PROXY_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const publicAuthUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
  if (!publicAuthUrl) return undefined;

  try {
    const url = new URL(publicAuthUrl);
    url.pathname = "/api/auth";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  redirectProxyUrl: getAuthRedirectProxyUrl(),
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
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
    async jwt({ token, profile, account }) {
      const appToken = token as typeof token & DiscordToken;

      if (profile) {
        const dp = profile as DiscordProfile;
        const username =
          dp.username ?? (typeof token.name === "string" ? token.name : "");
        const discriminator =
          dp.discriminator && dp.discriminator !== "0"
            ? `#${dp.discriminator}`
            : "";

        appToken.discordId = dp.id;
        appToken.discordUsername = username;
        appToken.discordHandle = `${dp.global_name ?? username}${discriminator}`;
        appToken.discordAvatar =
          dp.id && dp.avatar
            ? `https://cdn.discordapp.com/avatars/${dp.id}/${dp.avatar}.png?size=128`
            : undefined;
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
      session.user.discordId =
        typeof appToken.discordId === "string" ? appToken.discordId : undefined;
      session.user.discordUsername =
        typeof appToken.discordUsername === "string"
          ? appToken.discordUsername
          : undefined;
      session.user.discordHandle =
        typeof appToken.discordHandle === "string"
          ? appToken.discordHandle
          : undefined;
      session.user.discordAvatar =
        typeof appToken.discordAvatar === "string"
          ? appToken.discordAvatar
          : undefined;
      session.user.discordInGuild =
        typeof appToken.discordInGuild === "boolean"
          ? appToken.discordInGuild
          : undefined;
      return session;
    },
  },
});
