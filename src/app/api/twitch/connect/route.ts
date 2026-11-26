import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTwitchAuthorizeUrl, getTwitchLinkRedirectUri, getTwitchLinkReturnUrl, type TwitchReturnSource } from "@/lib/twitch-link";
import { createTwitchLinkState } from "@/lib/tournament-storage";
import { SUB_SCOPE } from "@/lib/winchallenge/subcheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES: TwitchReturnSource[] = ["main", "overlay", "tournament", "winchallenge", "winchallenge-einsatz"];

export async function GET(request: Request) {
	const params = new URL(request.url).searchParams;
	const requestedSource = params.get("from") as TwitchReturnSource | null;
	// `purpose=subs`: Win Challenge sub check. Asks for read access to the channel's subscribers.
	const purpose = params.get("purpose") === "subs" ? "subs" : undefined;
	const returnSource: TwitchReturnSource = purpose ? "winchallenge-einsatz" : requestedSource && SOURCES.includes(requestedSource) ? requestedSource : "main";
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "login-required", returnSource));
	}

	try {
		const state = randomBytes(32).toString("base64url");
		const redirectUri = getTwitchLinkRedirectUri(request.url);
		await createTwitchLinkState(state, discordId, returnSource, purpose);
		return NextResponse.redirect(getTwitchAuthorizeUrl({ state, redirectUri, scope: purpose ? SUB_SCOPE : undefined }));
	} catch (error) {
		console.error("[twitch-link] could not start OAuth:", error);
		return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "configuration", returnSource));
	}
}
