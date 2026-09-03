import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { isTestRosterModeActive } from "@/lib/test-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assignmentSchema = z.object({ group: z.string().regex(/^[A-P]$/), seed: z.number().int().min(1).max(32) }).nullable();
const payloadSchema = z.object({ assignments: z.record(z.string().min(1), assignmentSchema) });
type TeamDoc = { name: string; meta?: { group?: string; seed?: number } };
type BotStateDoc = { _id: string; teams?: Record<string, TeamDoc> };
type RosterDraftDoc = {
	_id: "default";
	teams?: Record<string, { group?: string | null; seed?: number | null }>;
	updatedAt?: string;
};

const ROSTER_DRAFT_COLLECTION = "tournament_roster_drafts";

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Gruppenzuteilung." }, { status: 400 });

	const settings = await getTournamentSettings();
	if (settings.ultimateBravery.dayOneFormat !== "groups")
		return NextResponse.json({ message: "Die Gruppenphase ist aktuell nicht als Tag-1-Format ausgewählt." }, { status: 409 });
	const validGroups = new Set(Array.from({ length: settings.ultimateBravery.groupCount }, (_, index) => String.fromCharCode(65 + index)));
	const baseGroupSize = Math.floor(settings.ultimateBravery.teamCount / settings.ultimateBravery.groupCount);
	const largerGroups = settings.ultimateBravery.teamCount % settings.ultimateBravery.groupCount;
	const groupSizes = new Map([...validGroups].map((group, index) => [group, baseGroupSize + (index < largerGroups ? 1 : 0)]));
	const slots = new Set<string>();
	for (const assignment of Object.values(parsed.data.assignments)) {
		if (!assignment) continue;
		if (!validGroups.has(assignment.group)) return NextResponse.json({ message: `Gruppe ${assignment.group} ist nicht konfiguriert.` }, { status: 400 });
		if (assignment.seed > (groupSizes.get(assignment.group) ?? 0)) {
			return NextResponse.json({ message: `Seed ${assignment.seed} liegt außerhalb von Gruppe ${assignment.group}.` }, { status: 400 });
		}
		const slot = `${assignment.group}-${assignment.seed}`;
		if (slots.has(slot)) return NextResponse.json({ message: `Gruppe ${assignment.group}, Seed ${assignment.seed} wurde doppelt belegt.` }, { status: 409 });
		slots.add(slot);
	}

	const db = await getDb();
	const collection = db.collection<BotStateDoc>("bot_state");
	const [doc, testModeActive] = await Promise.all([collection.findOne({ _id: "default" }), isTestRosterModeActive()]);
	const teams = doc?.teams ?? {};
	const unknown = Object.keys(parsed.data.assignments).filter((teamKey) => !teams[teamKey]);
	if (unknown.length) return NextResponse.json({ message: `Unbekannte Teams: ${unknown.join(", ")}` }, { status: 404 });

	if (testModeActive) {
		const $set: Record<string, unknown> = {};
		const $unset: Record<string, ""> = {};
		for (const teamKey of Object.keys(teams)) {
			const assignment = parsed.data.assignments[teamKey] ?? null;
			if (assignment) {
				$set[`teams.${teamKey}.meta.group`] = assignment.group;
				$set[`teams.${teamKey}.meta.seed`] = assignment.seed;
			} else {
				$unset[`teams.${teamKey}.meta.group`] = "";
				$unset[`teams.${teamKey}.meta.seed`] = "";
			}
		}
		await collection.updateOne({ _id: "default" }, { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) });
	} else {
		const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
		for (const teamKey of Object.keys(teams)) {
			const assignment = parsed.data.assignments[teamKey] ?? null;
			$set[`teams.${teamKey}.group`] = assignment?.group ?? null;
			$set[`teams.${teamKey}.seed`] = assignment?.seed ?? null;
		}
		await db.collection<RosterDraftDoc>(ROSTER_DRAFT_COLLECTION).updateOne({ _id: "default" }, { $set }, { upsert: true });
	}
	await writeAuditLog({
		action: "roster.groups_updated",
		targetType: "roster",
		targetId: "groups",
		summary: `${slots.size} Team(s) auf ${validGroups.size} Gruppe(n) verteilt${testModeActive ? " (Testmodus)" : " und als Entwurf gespeichert"}.`,
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
	});
	return NextResponse.json({ ok: true, assigned: slots.size, groups: validGroups.size });
}
