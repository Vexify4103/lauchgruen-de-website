import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteTwitchLink, getVerifiedAccount, updateTwitchLinkSettings } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z
	.object({
		showWhenLive: z.boolean().optional(),
		showInCommunityOverlay: z.boolean().optional(),
	})
	.refine((value) => value.showWhenLive !== undefined || value.showInCommunityOverlay !== undefined);

export async function PATCH(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Bitte zuerst anmelden." }, { status: 401 });
	}

	const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Einstellung." }, { status: 400 });
	}

	if (parsed.data.showInCommunityOverlay && !(await getVerifiedAccount(discordId))) {
		return NextResponse.json(
			{ message: "Verifiziere zuerst deine Riot-ID, bevor du im Community-Overlay erscheinen kannst." },
			{ status: 409 }
		);
	}

	const link = await updateTwitchLinkSettings(discordId, parsed.data);
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
