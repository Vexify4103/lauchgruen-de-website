import { NextResponse } from "next/server";
import {
  exchangeTwitchCode,
  getTwitchLinkRedirectUri,
  getTwitchLinkReturnUrl,
} from "@/lib/twitch-link";
import {
  consumeTwitchLinkState,
  getTwitchLink,
  upsertTwitchLink,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (denied || !code || !state) {
    return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "cancelled"));
  }

  try {
    const storedState = await consumeTwitchLinkState(state);
    if (!storedState) {
      return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "invalid-state"));
    }
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
      linkedAt: existing?.linkedAt ?? now,
      updatedAt: now,
    });

    return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "connected"));
  } catch (error) {
    console.error("[twitch-link] OAuth callback failed:", error);
    return NextResponse.redirect(getTwitchLinkReturnUrl(request.url, "failed"));
  }
}
