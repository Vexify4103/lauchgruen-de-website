import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createPreferenceGroup, getPreferenceGroupForDiscordId, joinPreferenceGroup, leavePreferenceGroup } from "@/lib/tournament-storage";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { wishGroupLimit } from "@/lib/preference-group-settings";
import { areTournamentApplicationsOpen } from "@/lib/tournament-application-deadline";

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

function publicGroup(group: Awaited<ReturnType<typeof getPreferenceGroupForDiscordId>>, maxMembers: number) {
	if (!group) return null;
	return {
		code: group.code,
		memberCount: group.memberDiscordIds.length,
		maxMembers,
	};
}

export async function GET() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	}

	const [group, settings] = await Promise.all([getPreferenceGroupForDiscordId(discordId), getTournamentSettings()]);
	return NextResponse.json({ group: publicGroup(group, wishGroupLimit(settings.wishGroupMode)), mode: settings.wishGroupMode });
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
		return NextResponse.json({ message: "Ungültige Wunschgruppen-Aktion." }, { status: 400 });
	}

	try {
		if (parsed.data.action === "leave") {
			await leavePreferenceGroup(discordId);
			return NextResponse.json({
				group: null,
				message: "Du hast die Wunschgruppe verlassen.",
			});
		}

		const settings = await getTournamentSettings();
		const maxMembers = wishGroupLimit(settings.wishGroupMode);
		if (maxMembers === 0) return NextResponse.json({ message: "Wunschgruppen sind für dieses Turnier deaktiviert." }, { status: 403 });
		if (!areTournamentApplicationsOpen(settings.applicationsOpen, new Date(), settings.applicationDeadlineOverride, settings.applicationDeadline, settings.applicationOpenAt)) {
			return NextResponse.json({ message: "Wunschgruppen können nur während der geöffneten Anmeldung erstellt oder erweitert werden." }, { status: 403 });
		}
		const group = parsed.data.action === "create" ? await createPreferenceGroup(discordId) : await joinPreferenceGroup(discordId, parsed.data.code, maxMembers);

		return NextResponse.json({
			group: publicGroup(group, maxMembers),
			message: parsed.data.action === "create" ? "Dein Wunschgruppen-Code ist bereit." : "Du bist der Wunschgruppe beigetreten.",
		});
	} catch (error) {
		const code = error instanceof Error ? error.message : "";
		const responses: Record<string, { message: string; status: number }> = {
			APPLICATION_REQUIRED: {
				message: "Du brauchst zuerst eine gespeicherte Bewerbung.",
				status: 403,
			},
			INVALID_GROUP_CODE: {
				message: "Dieser Wunschgruppen-Code ist ungültig.",
				status: 404,
			},
			ALREADY_IN_GROUP: {
				message: "Du bist bereits in einer Wunschgruppe. Verlasse sie zuerst, um einem anderen Code beizutreten.",
				status: 409,
			},
			GROUP_FULL: {
				message: "Diese Wunschgruppe hat die erlaubte Größe bereits erreicht.",
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
