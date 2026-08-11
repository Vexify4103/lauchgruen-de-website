import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { findApplicationByDiscordId, upsertApplication } from "@/lib/tournament-storage";

export const runtime = "nodejs";

const preferenceSchema = z.object({
	discordDmOptIn: z.boolean(),
});

export async function PATCH(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	}

	const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Einstellung." }, { status: 400 });
	}

	const application = await findApplicationByDiscordId(discordId);
	if (!application) {
		return NextResponse.json({ message: "Für dieses Discord-Konto wurde noch keine Bewerbung gefunden." }, { status: 404 });
	}

	await upsertApplication({
		...application,
		discordDmOptIn: parsed.data.discordDmOptIn,
		updatedAt: new Date().toISOString(),
	});

	return NextResponse.json({ ok: true, discordDmOptIn: parsed.data.discordDmOptIn });
}
