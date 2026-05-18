import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      discordId?: string;
      discordHandle?: string;
      discordUsername?: string;
    } & DefaultSession["user"];
  }
}

type DiscordProfile = {
  id?: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
};

type DiscordToken = {
  discordId?: string;
  discordHandle?: string;
  discordUsername?: string;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
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
    async signIn({ account }) {
      const requiredGuildId = process.env.DISCORD_GUILD_ID;

      if (!requiredGuildId || !account?.access_token) {
        return true;
      }

      const response = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: { authorization: `Bearer ${account.access_token}` },
      });

      if (!response.ok) return false;

      const guilds = (await response.json()) as Array<{ id?: string }>;
      return guilds.some((guild) => guild.id === requiredGuildId);
    },
    async jwt({ token, profile }) {
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
      return session;
    },
  },
});
