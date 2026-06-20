import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS, adminCreatePreferenceGroup, adminMovePreferenceGroupMember } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("create"),
		discordIds: z.array(z.string().trim().min(1)).min(1).max(2),
		expectedVersion: z.number().int().min(0),
	}),
	z.object({
		action: z.literal("move"),
		discordId: z.string().trim().min(1),
		targetCode: z.string().trim().min(1).max(20).nullable(),
		expectedVersion: z.number().int().min(0),
	}),
]);

async function writeAdminAudit(entry: Parameters<typeof writeAuditLog>[0]) {
	try {
		await writeAuditLog(entry);
	} catch (error) {
		console.error("[preference-groups] Audit-Log konnte nicht geschrieben werden.", error);
	}
}

export async function POST(request: Request) {
	const session = await auth();
	const actorDiscordId = session?.user?.discordId;
	if (!actorDiscordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(actorDiscordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Gruppendaten." }, { status: 400 });
	}

	const versionClaim = await claimAdminVersion({
		resource: "preference-groups",
		expectedVersion: parsed.data.expectedVersion,
		updatedBy: session.user.discordHandle ?? actorDiscordId,
	});
	if (!versionClaim.ok) {
		return NextResponse.json(versionClaim.conflict, { status: 409 });
	}

	try {
		if (parsed.data.action === "create") {
			const group = await adminCreatePreferenceGroup(parsed.data.discordIds);
			await writeAdminAudit({
				action: "preference_group.created_by_admin",
				targetType: "preference_group",
				targetId: group.code,
				summary: `Wunschduo ${group.code} mit ${group.memberDiscordIds.length} Personen erstellt.`,
				actorDiscordId,
				actorLabel: session.user.discordHandle ?? actorDiscordId,
				metadata: { memberDiscordIds: group.memberDiscordIds },
			});
			return NextResponse.json({ group, version: versionClaim.version });
		}

		const group = await adminMovePreferenceGroupMember(parsed.data.discordId, parsed.data.targetCode);
		await writeAdminAudit({
			action: group ? "preference_group.member_moved_by_admin" : "preference_group.member_removed_by_admin",
			targetType: "preference_group",
			targetId: group?.code ?? parsed.data.discordId,
			summary: group ? `Person wurde dem Wunschduo ${group.code} zugewiesen.` : "Person wurde aus ihrem Wunschduo entfernt.",
			actorDiscordId,
			actorLabel: session.user.discordHandle ?? actorDiscordId,
			metadata: {
				memberDiscordId: parsed.data.discordId,
				targetCode: group?.code ?? null,
			},
		});
		return NextResponse.json({ group, version: versionClaim.version });
	} catch (error) {
		const code = error instanceof Error ? error.message : "";
		const responses: Record<string, { message: string; status: number }> = {
			INVALID_GROUP_SIZE: {
				message: "Ein Wunschduo braucht ein oder zwei Personen.",
				status: 400,
			},
			APPLICATION_REQUIRED: {
				message: "Alle ausgewählten Personen benötigen eine Bewerbung.",
				status: 400,
			},
			ALREADY_IN_GROUP: {
				message: "Mindestens eine ausgewählte Person ist bereits in einem Wunschduo.",
				status: 409,
			},
			INVALID_GROUP_CODE: {
				message: "Das ausgewählte Wunschduo existiert nicht.",
				status: 404,
			},
			GROUP_FULL: {
				message: "Das Ziel-Wunschduo ist bereits voll.",
				status: 409,
			},
			CODE_GENERATION_FAILED: {
				message: "Der Gruppencode konnte nicht erzeugt werden.",
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
