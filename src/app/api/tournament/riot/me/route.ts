import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getVerifiedAccount } from "@/lib/tournament-storage";

export const runtime = "nodejs";

export async function GET() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ verified: null });
	}
	const verified = await getVerifiedAccount(discordId);
	return NextResponse.json({ verified });
}
