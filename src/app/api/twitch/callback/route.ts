import { NextResponse } from "next/server";
import { exchangeTwitchCode, getTwitchLinkRedirectUri, getTwitchLinkReturnUrl } from "@/lib/twitch-link";
import { consumeTwitchLinkState, getTwitchLink, upsertTwitchLink } from "@/lib/tournament-storage";

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

	let returnSource: "main" | "overlay" | "tournament" | undefined;
	try {
		const storedState = await consumeTwitchLinkState(state);
		if (!storedState) {
			return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "invalid-state"));
		}
		returnSource = storedState.returnSource;
		const discordId = storedState.discordId;
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
