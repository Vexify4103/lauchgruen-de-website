import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTwitchAuthorizeUrl, getTwitchLinkRedirectUri, getTwitchLinkReturnUrl } from "@/lib/twitch-link";
import { createTwitchLinkState } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "login-required"));
	}

	try {
		const state = randomBytes(32).toString("base64url");
		const redirectUri = getTwitchLinkRedirectUri(request.url);
		await createTwitchLinkState(state, discordId);
		return NextResponse.redirect(getTwitchAuthorizeUrl({ state, redirectUri }));
	} catch (error) {
		console.error("[twitch-link] could not start OAuth:", error);
		return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "configuration"));
	}
}
