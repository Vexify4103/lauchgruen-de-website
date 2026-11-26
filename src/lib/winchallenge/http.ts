import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { WinActionError } from "@/lib/winchallenge/actions";

export const NO_STORE = { "Cache-Control": "no-store" };

export function winJson(body: unknown, status = 200) {
	return NextResponse.json(body, { status, headers: NO_STORE });
}

export function winError(status: number, message: string, code = "error") {
	return winJson({ error: { code, message }, message }, status);
}

export type WinUser = { discordId: string; name: string; isOwner: boolean };

export async function currentUser(): Promise<WinUser | null> {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return null;
	return { discordId, name: session.user.discordHandle ?? session.user.name ?? discordId, isOwner: TOURNAMENT_OWNER_DISCORD_IDS.has(discordId) };
}

/** Turns known rule errors into 400/409 answers and logs everything else. */
export function handleWinError(error: unknown, fallback: string) {
	if (error instanceof WinActionError) return winError(error.code === "busy" ? 409 : 400, error.message, error.code);
	console.error("[winchallenge]", error);
	return winError(500, fallback);
}
