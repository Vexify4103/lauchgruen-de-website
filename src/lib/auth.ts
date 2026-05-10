import NextAuth, { type DefaultSession } from "next-auth";
import Twitch from "next-auth/providers/twitch";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      twitchLogin: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    twitchLogin?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Twitch({
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      authorization: { params: { scope: "openid user:read:email" } },
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const tp = profile as { preferred_username?: string };
        token.twitchLogin =
          tp.preferred_username ?? (typeof token.name === "string" ? token.name : "");
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      const fromToken = typeof token.twitchLogin === "string" ? token.twitchLogin : "";
      const name: string = typeof token.name === "string" ? token.name : "";
      session.user.twitchLogin = fromToken || name;
      return session;
    },
  },
});
