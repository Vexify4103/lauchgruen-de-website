import { NextResponse } from "next/server";
import { exchangeTwitchCode, exchangeTwitchCodeWithToken, getTwitchLinkRedirectUri, getTwitchLinkReturnUrl, type TwitchReturnSource } from "@/lib/twitch-link";
import { consumeTwitchLinkState, getTwitchLink, upsertTwitchLink, type TwitchLinkState } from "@/lib/tournament-storage";
import { getVisibleChallenge } from "@/lib/winchallenge/store";
import { checkSubs, saveSubChannel } from "@/lib/winchallenge/subcheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const denied = url.searchParams.get("error");
	if (denied || !code || !state) {
		const cancelledState = state ? await consumeTwitchLinkState(state) : null;
		return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "cancelled", cancelledState?.returnSource));
	}

	let returnSource: TwitchReturnSource | undefined;
	try {
		const storedState = await consumeTwitchLinkState(state);
		if (!storedState) {
			return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "invalid-state"));
		}
		returnSource = storedState.returnSource;
		const discordId = storedState.discordId;
		if (storedState.purpose === "subs") return await connectSubChannel(request.url, code, storedState);
		const identity = await exchangeTwitchCode({
			code,
			redirectUri: getTwitchLinkRedirectUri(request.url),
		});
		const existing = await getTwitchLink(discordId);
		const now = new Date().toISOString();
		await upsertTwitchLink({
			discordId,
			...identity,
			showWhenLive: existing?.showWhenLive ?? true,
			showInCommunityOverlay: existing?.twitchUserId === identity.twitchUserId ? (existing.showInCommunityOverlay ?? false) : false,
			linkedAt: existing?.linkedAt ?? now,
			updatedAt: now,
		});
		return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "connected", storedState.returnSource));
	} catch (error) {
		console.error("[twitch-link] OAuth callback failed:", error);
		return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "failed", returnSource));
	}
}

/**
 * Win Challenge sub check: stores the channel token, never touches the account link.
 * Only the channel the player already linked may be connected, so nobody reads a foreign channel.
 */
async function connectSubChannel(requestUrl: string, code: string, state: TwitchLinkState) {
	const { identity, token } = await exchangeTwitchCodeWithToken({ code, redirectUri: getTwitchLinkRedirectUri(requestUrl) });
	const link = await getTwitchLink(state.discordId);
	if (!link || link.twitchUserId !== identity.twitchUserId) {
		return NextResponse.redirect(getTwitchLinkReturnUrl(requestUrl, "subs-mismatch", "winchallenge-einsatz"));
	}
	if (!token.refreshToken) throw new Error("Twitch hat kein Refresh-Token geliefert.");
	await saveSubChannel({ twitchUserId: identity.twitchUserId, login: identity.login, discordId: state.discordId, ...token });
	const challenge = await getVisibleChallenge().catch(() => null);
	if (challenge && challenge.status !== "open") {
		await checkSubs(challenge, { channels: [identity.login], force: true }).catch((error) => console.error("[winchallenge] sub check after connect failed:", error));
	}
	return NextResponse.redirect(getTwitchLinkReturnUrl(requestUrl, "subs-connected", "winchallenge-einsatz"));
}
