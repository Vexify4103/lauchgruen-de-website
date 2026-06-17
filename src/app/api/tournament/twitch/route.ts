import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteTwitchLink, updateTwitchLinkVisibility } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const visibilitySchema = z.object({
	showWhenLive: z.boolean(),
});

export async function PATCH(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Bitte zuerst anmelden." }, { status: 401 });
	}

	const parsed = visibilitySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Einstellung." }, { status: 400 });
	}

	const link = await updateTwitchLinkVisibility(discordId, parsed.data.showWhenLive);
	if (!link) {
		return NextResponse.json({ message: "Noch kein Twitch-Konto verbunden." }, { status: 404 });
	}

	return NextResponse.json({ link });
}

export async function DELETE() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Bitte zuerst anmelden." }, { status: 401 });
	}

	await deleteTwitchLink(discordId);
	return NextResponse.json({ ok: true });
}
