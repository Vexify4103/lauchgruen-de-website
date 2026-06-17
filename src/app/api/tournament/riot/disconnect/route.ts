import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clearRiotLink } from "@/lib/tournament-storage";

export const runtime = "nodejs";

export async function POST() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	}
	await clearRiotLink(discordId);
	return NextResponse.json({ ok: true });
}
