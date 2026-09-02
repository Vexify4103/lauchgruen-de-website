import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteUltimateBraveryRoll, resetUltimateBraveryTestDraft } from "@/lib/ultimate-bravery";
import {
	claimUltimateBraveryTestSlot,
	fillUltimateBraveryTestSlotsWithDummies,
	listUltimateBraveryTestSlots,
	releaseUltimateBraveryTestSlot,
	releaseUltimateBraveryTestSlotById,
	resetUltimateBraveryTestSlots,
	ULTIMATE_BRAVERY_TEST_MATCH_ID,
} from "@/lib/ultimate-bravery-test";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
	action: z.enum(["claim", "leave", "release", "reset", "solo"]),
	slotId: z.string().trim().min(1).optional(),
});

async function payload(discordId: string) {
	const slots = await listUltimateBraveryTestSlots();
	return {
		slots,
		currentSlotId: slots.find((slot) => slot.discordId === discordId)?.slotId ?? null,
		claimedCount: slots.filter((slot) => slot.discordId).length,
		ready: slots.every((slot) => slot.discordId),
		isAdmin: TOURNAMENT_OWNER_DISCORD_IDS.has(discordId),
	};
}

export async function GET() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	return NextResponse.json(await payload(discordId));
}

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	const parsed = actionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Testlobby-Aktion." }, { status: 400 });
	const isAdmin = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);

	try {
		if (parsed.data.action === "claim") {
			if (!parsed.data.slotId) return NextResponse.json({ message: "Bitte wähle einen Testplatz." }, { status: 400 });
			await claimUltimateBraveryTestSlot({
				slotId: parsed.data.slotId,
				discordId,
				displayName: session.user.discordHandle ?? session.user.discordUsername ?? session.user.name ?? discordId,
			});
		} else if (parsed.data.action === "leave") {
			const released = await releaseUltimateBraveryTestSlot(discordId);
			if (released) await deleteUltimateBraveryRoll(ULTIMATE_BRAVERY_TEST_MATCH_ID, discordId);
		} else if (parsed.data.action === "release") {
			if (!isAdmin) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
			if (!parsed.data.slotId) return NextResponse.json({ message: "Testplatz fehlt." }, { status: 400 });
			const releasedDiscordId = await releaseUltimateBraveryTestSlotById(parsed.data.slotId);
			if (releasedDiscordId) await deleteUltimateBraveryRoll(ULTIMATE_BRAVERY_TEST_MATCH_ID, releasedDiscordId);
		} else if (parsed.data.action === "reset") {
			if (!isAdmin) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
			await Promise.all([resetUltimateBraveryTestSlots(), resetUltimateBraveryTestDraft()]);
		} else {
			if (!isAdmin) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
			await resetUltimateBraveryTestDraft();
			await fillUltimateBraveryTestSlotsWithDummies();
		}
		return NextResponse.json({
			...(await payload(discordId)),
			message: parsed.data.action === "claim" ? "Testplatz belegt." : parsed.data.action === "solo" ? "Solo-Test mit zehn Dummies ist bereit." : "Testlobby aktualisiert.",
		});
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Testlobby konnte nicht aktualisiert werden." }, { status: 409 });
	}
}
