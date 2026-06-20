import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { TOURNAMENT_PREFERENCE_GROUP_LIMIT, createPreferenceGroup, getPreferenceGroupForDiscordId, joinPreferenceGroup, leavePreferenceGroup } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("create") }),
	z.object({
		action: z.literal("join"),
		code: z.string().trim().min(1).max(20),
	}),
	z.object({ action: z.literal("leave") }),
]);

function publicGroup(group: Awaited<ReturnType<typeof getPreferenceGroupForDiscordId>>) {
	if (!group) return null;
	return {
		code: group.code,
		memberCount: group.memberDiscordIds.length,
		maxMembers: TOURNAMENT_PREFERENCE_GROUP_LIMIT,
	};
}

export async function GET() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	}

	const group = await getPreferenceGroupForDiscordId(discordId);
	return NextResponse.json({ group: publicGroup(group) });
}

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const parsed = actionSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Wunschduo-Aktion." }, { status: 400 });
	}

	try {
		if (parsed.data.action === "leave") {
			await leavePreferenceGroup(discordId);
			return NextResponse.json({
				group: null,
				message: "Du hast das Wunschduo verlassen.",
			});
		}

		const group = parsed.data.action === "create" ? await createPreferenceGroup(discordId) : await joinPreferenceGroup(discordId, parsed.data.code);

		return NextResponse.json({
			group: publicGroup(group),
			message: parsed.data.action === "create" ? "Dein Wunschduo-Code ist bereit." : "Du bist dem Wunschduo beigetreten.",
		});
	} catch (error) {
		const code = error instanceof Error ? error.message : "";
		const responses: Record<string, { message: string; status: number }> = {
			APPLICATION_REQUIRED: {
				message: "Du brauchst zuerst eine gespeicherte Bewerbung.",
				status: 403,
			},
			INVALID_GROUP_CODE: {
				message: "Dieser Wunschduo-Code ist ungültig.",
				status: 404,
			},
			ALREADY_IN_GROUP: {
				message: "Du bist bereits in einem Wunschduo. Verlasse es zuerst, um einem anderen Code beizutreten.",
				status: 409,
			},
			GROUP_FULL: {
				message: "Dieses Wunschduo hat bereits zwei Mitglieder.",
				status: 409,
			},
			CODE_GENERATION_FAILED: {
				message: "Der Code konnte gerade nicht erstellt werden. Bitte versuche es erneut.",
				status: 503,
			},
		};
		const response = responses[code];
		if (response) {
			return NextResponse.json({ message: response.message }, { status: response.status });
		}
		throw error;
	}
}
